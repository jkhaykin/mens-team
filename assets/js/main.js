// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
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
    const createMobileMenu = () => {
        const header = document.querySelector('.site-header');
        const nav = document.querySelector('.main-nav');
        
        // Create hamburger menu button
        const hamburger = document.createElement('div');
        hamburger.className = 'hamburger';
        hamburger.innerHTML = '<span></span><span></span><span></span>';
        header.querySelector('.wrapper').appendChild(hamburger);
        
        // Toggle navigation on click
        hamburger.addEventListener('click', function() {
            this.classList.toggle('active');
            nav.classList.toggle('open');
        });
        
        // Close menu when clicking a link
        const navLinks = nav.querySelectorAll('a');
        navLinks.forEach(link => {
            link.addEventListener('click', function() {
                hamburger.classList.remove('active');
                nav.classList.remove('open');
            });
        });
    };
    
    // Initialize mobile menu for smaller screens
    const mobileMenuInit = () => {
        if (window.innerWidth <= 768) {
            createMobileMenu();
        }
    };
    
    mobileMenuInit();
    
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