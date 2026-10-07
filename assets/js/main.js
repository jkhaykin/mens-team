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