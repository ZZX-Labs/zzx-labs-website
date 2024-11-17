document.addEventListener("DOMContentLoaded", function () {
    // Smooth Scroll for internal links
    const scrollLinks = document.querySelectorAll('a[href^="#"]');
    scrollLinks.forEach(function (link) {
        link.addEventListener('click', function (e) {
            e.preventDefault();
            const targetId = link.getAttribute('href').substring(1);
            const targetElement = document.getElementById(targetId);
            window.scrollTo({
                top: targetElement.offsetTop - 70,
                behavior: 'smooth'
            });
        });
    });

    // Contact Form Validation
    const form = document.querySelector("form");
    if (form) {
        form.addEventListener("submit", function (e) {
            const email = document.querySelector("input[type='email']");
            const message = document.querySelector("textarea");

            if (!email.value || !message.value) {
                e.preventDefault();
                alert("Please fill in all required fields.");
            }
        });
    }

    // Navigation Toggle (for mobile views)
    const menuButton = document.querySelector("#navbar-toggle");
    const navLinks = document.querySelector("#navbar-links");
    
    if (menuButton) {
        menuButton.addEventListener("click", function () {
            navLinks.classList.toggle("open");
        });
    }
});
