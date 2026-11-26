// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    // Keep the footer copyright year current
    document.querySelectorAll('.current-year').forEach(el => {
        el.textContent = new Date().getFullYear();
    });

    // Get elements
    const topButton = document.getElementById('top-button');
    const contactForm = document.getElementById('contact-form');
    
    // Back to top button functionality
    window.addEventListener('scroll', function() {
        if (window.pageYOffset > 300) { // Show button after scrolling 300px
            topButton.parentElement.classList.add('show');
        } else {
            topButton.parentElement.classList.remove('show');
        }
    });
    
    topButton.addEventListener('click', function(e) {
        e.preventDefault();
        window.scrollTo({
            top: 0,
            behavior: 'smooth' // Smooth scrolling
        });
    });
    
    // Smooth scrolling for navigation links
    const navLinks = document.querySelectorAll('a[href^="#"]');
    
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            if (this.getAttribute('href') !== '#') {
                e.preventDefault();
                
                const targetId = this.getAttribute('href');
                const targetSection = document.querySelector(targetId);
                
                if (targetSection) {
                    const headerHeight = document.querySelector('.site-header').offsetHeight;
                    const targetPosition = targetSection.offsetTop - headerHeight;
                    
                    window.scrollTo({
                        top: targetPosition,
                        behavior: 'smooth'
                    });
                }
            }
        });
    });
    
    // Embedded JotForm: the form reports its height to this page (it grows
    // when "required" errors appear). Resize its frame to match; a fixed
    // height cut off the Submit button. When an error appears, also scroll
    // it into view below the fixed header.
    window.addEventListener('message', function(e) {
        if (e.origin !== 'https://form.jotform.com') return;
        const frame = Array.from(document.querySelectorAll('iframe[id^="JotFormIFrame-"]'))
            .find(f => f.contentWindow === e.source);
        if (!frame) return;

        // Heights arrive as text ("setHeight:939:<form id>"); the error
        // position arrives as an object.
        let msg = e.data;
        if (typeof msg === 'string') {
            const parts = msg.split(':');
            if (parts[0] === 'setHeight') {
                const height = parseInt(parts[1], 10);
                if (height > 0 && height < 5000) frame.style.height = height + 'px';
                return;
            }
            try { msg = JSON.parse(msg); } catch (err) { return; }
        }
        if (msg && msg.type === 'NVA_VALIDATION_ERROR_POSITION' && msg.validationErrorY >= 0) {
            const header = document.querySelector('.site-header');
            // JotForm's position is about 70px below the field's label; leave
            // room so the label shows too.
            const offset = (header ? header.offsetHeight : 0) + 100;
            window.scrollTo({
                top: frame.getBoundingClientRect().top + window.pageYOffset + msg.validationErrorY - offset,
                behavior: 'smooth'
            });
        }
    });

    // Mobile navigation toggle
    const hamburger = document.querySelector('.hamburger');
    const nav = document.querySelector('.main-nav');

    const setMenuOpen = (open) => {
        hamburger.classList.toggle('active', open);
        nav.classList.toggle('open', open);
        hamburger.setAttribute('aria-expanded', open);
        hamburger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    };

    // Collapse to the hamburger menu whenever the full menu doesn't fit on one
    // line. Measuring (instead of a fixed breakpoint) handles different fonts,
    // zoom levels and text-size settings.
    const header = document.querySelector('.site-header');
    const headerRow = header.querySelector('.wrapper');
    const logo = header.querySelector('.logo');
    const navList = nav.querySelector('ul');

    const fitNav = () => {
        const wasOpen = nav.classList.contains('open');
        header.classList.remove('nav-collapsed');
        if (getComputedStyle(hamburger).display !== 'none') return; // fallback query already collapsed it
        const rowStyle = getComputedStyle(headerRow);
        const available = headerRow.clientWidth - parseFloat(rowStyle.paddingLeft) - parseFloat(rowStyle.paddingRight);
        const needed = logo.offsetWidth + navList.scrollWidth + 32;
        if (needed > available) {
            header.classList.add('nav-collapsed');
        } else if (wasOpen) {
            setMenuOpen(false);
        }
    };

    let fitQueued = false;
    const queueFit = () => {
        if (fitQueued) return;
        fitQueued = true;
        requestAnimationFrame(() => { fitQueued = false; fitNav(); });
    };
    fitNav();
    window.addEventListener('resize', queueFit);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitNav);

    // Resources dropdown: hover, click or Enter/Space opens it, both in the
    // full-width menu and the hamburger menu (tap on phones).
    // In the hamburger menu each section opens and closes on its own; closing
    // one when another is tapped would shift the list under the finger.
    const isCollapsed = () => header.classList.contains('nav-collapsed') ||
        getComputedStyle(hamburger).display !== 'none';
    const submenus = Array.from(nav.querySelectorAll('.has-submenu'));
    // Menus can sit inside menus (Resources > Team Tools); closing one closes
    // any open inside it.
    const toggleOf = item => item.querySelector(':scope > .submenu-toggle');
    const setSubmenuOpen = (item, open) => {
        item.classList.toggle('open', open);
        toggleOf(item).setAttribute('aria-expanded', open);
        if (!open) submenus.forEach(inner => { if (inner !== item && item.contains(inner)) setSubmenuOpen(inner, false); });
    };
    const closeSubmenus = () => submenus.forEach(item => setSubmenuOpen(item, false));
    submenus.forEach(item => {
        toggleOf(item).addEventListener('click', function() {
            setSubmenuOpen(item, !item.classList.contains('open'));
        });
        // A menu shown by hover closes when the pointer leaves; take any menu
        // clicked open inside it along, so it doesn't reappear next hover.
        item.addEventListener('mouseleave', function() {
            if (!isCollapsed() && !item.classList.contains('open')) setSubmenuOpen(item, false);
        });
        item.addEventListener('focusout', function(e) {
            if (!isCollapsed() && !item.contains(e.relatedTarget)) setSubmenuOpen(item, false);
        });
    });
    document.addEventListener('click', function(e) {
        if (isCollapsed() && nav.contains(e.target)) return;
        submenus.forEach(item => { if (!item.contains(e.target)) setSubmenuOpen(item, false); });
    });
    document.addEventListener('keydown', function(e) {
        // Escape closes the innermost open menu first.
        const openItem = submenus.filter(item => item.classList.contains('open')).pop();
        if (e.key === 'Escape' && openItem) {
            setSubmenuOpen(openItem, false);
            toggleOf(openItem).focus();
        }
    });
    nav.querySelectorAll('.submenu a').forEach(link => link.addEventListener('click', closeSubmenus));
    closeSubmenus();

    hamburger.addEventListener('click', function() {
        setMenuOpen(!nav.classList.contains('open'));
    });

    // Close menu when clicking a link
    nav.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', function() {
            setMenuOpen(false);
        });
    });
    
    // Contact form handling
    if (contactForm) {
        contactForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            // Get form values
            const name = document.getElementById('name').value;
            const email = document.getElementById('email').value;
            const message = document.getElementById('message').value;
            
            // For demo purposes - would normally send to server
            console.log('Form submitted with:', { name, email, message });
            
            // Show success message
            const formContainer = contactForm.parentElement;
            const successMessage = document.createElement('div');
            successMessage.className = 'success-message';
            successMessage.innerHTML = '<h3>Thank you for your message!</h3><p>We will get back to you soon.</p>';
            
            // Replace form with success message
            formContainer.replaceChild(successMessage, contactForm);
        });
    }
}); 