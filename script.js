// Handle Mobile Navigation Menu Toggle
const menuButton = document.querySelector('.menu-button');
const navLinks = document.querySelector('.nav-links');

// Toggle the nav menu on small screens
menuButton.addEventListener('click', () => {
    navLinks.classList.toggle('open');
});

// Smooth Scrolling for Anchor Links
const anchorLinks = document.querySelectorAll('a[href^="#"]');

anchorLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = link.getAttribute('href').substring(1);
        const targetElement = document.getElementById(targetId);
        
        if (targetElement) {
            window.scrollTo({
                top: targetElement.offsetTop - 60, // Adjust for fixed header
                behavior: 'smooth'
            });
        }
    });
});

// Handle Button Hover Effects
const buttons = document.querySelectorAll('button');

buttons.forEach(button => {
    button.addEventListener('mouseover', () => {
        button.style.transform = 'scale(1.05)';
    });

    button.addEventListener('mouseout', () => {
        button.style.transform = 'scale(1)';
    });

    button.addEventListener('mousedown', () => {
        button.style.transform = 'scale(1)';
    });
});

// Handle Active State on Navigation Links
const navLinksList = document.querySelectorAll('.nav-links a');

navLinksList.forEach(link => {
    link.addEventListener('mouseover', () => {
        link.style.backgroundColor = '#e6a42b';
        link.style.transform = 'scale(1.05)';
    });

    link.addEventListener('mouseout', () => {
        link.style.backgroundColor = '';
        link.style.transform = 'scale(1)';
    });

    link.addEventListener('mousedown', () => {
        link.style.transform = 'scale(1)';
    });
});

// Handle Form Submission (Example: AJAX or simple alert)
const form = document.querySelector('form');

if (form) {
    form.addEventListener('submit', function (e) {
        e.preventDefault(); // Prevent actual submission for now
        const formData = new FormData(form);
        
        // Example of using FormData with fetch API for AJAX submission (uncomment to enable):
        /*
        fetch('/submit-form', {
            method: 'POST',
            body: formData,
        }).then(response => {
            if (response.ok) {
                alert('Form submitted successfully!');
            } else {
                alert('Error submitting form!');
            }
        }).catch(error => {
            alert('Error: ' + error);
        });
        */
        
        alert('Form submitted!');
    });
}

// Handle Scroll Animations (optional: for when elements appear on scroll)
const scrollElements = document.querySelectorAll('.scroll-animation');

const isElementInViewport = (el) => {
    const rect = el.getBoundingClientRect();
    return (
        rect.top <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.bottom >= 0
    );
};

const scrollAnimation = () => {
    scrollElements.forEach(el => {
        if (isElementInViewport(el)) {
            el.classList.add('in-view');
        } else {
            el.classList.remove('in-view');
        }
    });
};

window.addEventListener('scroll', scrollAnimation);
scrollAnimation(); // Run once on load to handle any pre-visible elements

// Handle Button Clicks for Forms/Actions (Example: For handling CTA button clicks)
const ctaButtons = document.querySelectorAll('.cta-button');

ctaButtons.forEach(button => {
    button.addEventListener('click', () => {
        // Example action for CTA button
        alert('CTA Button clicked!');
    });
});
