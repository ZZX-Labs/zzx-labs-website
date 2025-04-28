document.addEventListener('DOMContentLoaded', () => {
    // Select relevant elements
    const menuButton = document.getElementById('navbar-toggle'); // your menu button
    const navLinks = document.getElementById('navbar-links');    // your nav container
    const body = document.body;
    const submenuToggles = document.querySelectorAll('.submenu-toggle');

    // Toggle Main Navbar (Mobile/Desktop)
    menuButton.addEventListener('click', () => {
        const isOpen = navLinks.classList.toggle('open');

        // Update ARIA attributes
        menuButton.setAttribute('aria-expanded', isOpen);
        navLinks.setAttribute('aria-hidden', !isOpen);

        // Lock scroll when menu open
        if (isOpen) {
            body.classList.add('no-scroll');
        } else {
            body.classList.remove('no-scroll');
        }
    });

    // Toggle Submenus (Collapsible)
    submenuToggles.forEach(toggle => {
        toggle.addEventListener('click', (e) => {
            const submenu = toggle.nextElementSibling;
            submenu.classList.toggle('open');
            toggle.classList.toggle('open'); // Rotate arrow
        });
    });

    // Smooth Scrolling for Anchor Links
    document.querySelectorAll('a[href^="#"]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('href').substring(1);
            const targetElement = document.getElementById(targetId);

            if (targetElement) {
                window.scrollTo({
                    top: targetElement.offsetTop - 60,
                    behavior: 'smooth'
                });

                // Close menu if open
                if (navLinks.classList.contains('open')) {
                    navLinks.classList.remove('open');
                    menuButton.setAttribute('aria-expanded', false);
                    navLinks.setAttribute('aria-hidden', true);
                    body.classList.remove('no-scroll');
                }
            }
        });
    });

    // Handle Active State for Navbar Links
    const navLinksList = document.querySelectorAll('.nav-links a');
    navLinksList.forEach(link => {
        link.addEventListener('click', () => {
            navLinksList.forEach(navLink => navLink.classList.remove('active'));
            link.classList.add('active');
        });
    });

    // Button Hover Scaling
    const buttons = document.querySelectorAll('button');
    buttons.forEach(button => {
        button.addEventListener('mouseover', () => button.style.transform = 'scale(1.05)');
        button.addEventListener('mouseout', () => button.style.transform = 'scale(1)');
        button.addEventListener('mousedown', () => button.style.transform = 'scale(1)');
    });

    // Scroll Animations
    const scrollElements = document.querySelectorAll('.scroll-animation');

    const isInViewport = (el) => {
        const rect = el.getBoundingClientRect();
        return rect.top <= (window.innerHeight || document.documentElement.clientHeight) && rect.bottom >= 0;
    };

    const handleScrollAnimation = () => {
        scrollElements.forEach(el => {
            if (isInViewport(el)) {
                el.classList.add('in-view');
            } else {
                el.classList.remove('in-view');
            }
        });
    };

    window.addEventListener('scroll', handleScrollAnimation);
    handleScrollAnimation();
});
