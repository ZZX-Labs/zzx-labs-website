# ZZX-Labs-Website

Welcome to the **ZZX-Labs Website** repository! This project contains all the files needed for hosting the ZZX-Labs website, a private technology research & development services provider, and allows for seamless integration with mirrored local servers for development and production.

## Overview

ZZX-Labs is a research and development firm that provides cutting-edge services in areas such as Bitcoin, machine learning (ML), artificial intelligence (AI), cybersecurity, software and hardware development, and much more. This repository contains:

- HTML, CSS, and JavaScript files for the full website.
- A Flask-based API backend for handling services, blog posts, and payment integrations.
- Docker, nginx, and configuration files for setting up mirrored local servers for development and production environments.
- Integration with GitHub for version control and automatic deployment.
- RSS feeds, downloads API, and Bitcoin payment systems.

The site will eventually be hosted on a custom web domain using a DDNS service like No-IP or Hostinger. All content is mirrored across local servers to allow for smooth development and continuous integration.

## Features

- **Frontend:**
  - Fully responsive, modern design with a consistent layout.
  - Multiple pages with dynamic content like home, about, blog, services, and legal notices.
  - Areas of Focus splash page with separate content pages for each expertise (e.g., Bitcoin, ML, AI, etc.).
  - Interactive navbar and footer sections that are included on each page for consistency.

- **Backend (Flask API):**
  - API to handle RSS feeds for blog posts.
  - API to serve downloadable resources (papers, whitepapers, software, etc.).
  - Integration with Bitcoin payment for paid services.

- **Mirrored Local Servers:**
  - Local servers running on Windows 10, Raspberry Pi, and Dell PowerEdge 730d.
  - Automatic synchronization of code between the main GitHub repository and local servers for testing and deployment.

- **Deployment:**
  - Web hosting using a DDNS service.
  - Integration with Cloudflare for DNS management and security.
  - SSL/TLS using OpenSSL for secure communications.
  
## Project Structure

```
/zzx-labs-website
│
├── /static
│   ├── /css
│   │   └── styles.css        # Main CSS stylesheet
│   ├── /js
│   │   └── script.js         # Main JavaScript file for interactivity
│   └── /images
│       └── banner.jpg        # Banner image for the header
│
├── /templates
│   ├── about.html            # About page
│   ├── areas-of-focus.html  # Areas of focus splash page
│   ├── bitcoin.html         # Bitcoin-related page
│   ├── cysec.html           # Cybersecurity-related page
│   ├── consulting.html      # Consulting services page
│   ├── papers.html          # Research papers page
│   ├── blog.html            # Blog page
│   ├── contact.html         # Contact page
│   └── header.html          # Header with navbar and branding
│
├── /api
│   ├── app.py               # Flask API for blog RSS, downloads, and services
│   ├── bitcoin_payment.py   # Handles Bitcoin payments
│
├── /legal
│   ├── terms-of-service.html
│   ├── legal-disclaimer.html
│   ├── legal-notice.html
│   └── legal-waiver.html
│
├── /expertise
│   ├── ml.html              # Machine Learning page
│   ├── ai.html              # Artificial Intelligence page
│   └── firmware-dev.html    # Firmware Development page
│
├── docker-compose.yml       # Docker configuration for mirrored servers
├── nginx.conf               # Nginx configuration for the local servers
└── README.md                # Project documentation
```

## Setup & Installation

### Prerequisites

To run this project locally or on your own servers, you will need:

- **Git** for version control.
- **Docker** for setting up local servers (optional, but recommended).
- **Python 3.x** and **pip** for running the Flask API.
- **nginx** for serving the website locally.
- **Cloudflare** for DNS management (optional but recommended).

### Running the Website Locally

1. **Clone the repository**:

   ```bash
   git clone https://github.com/ZZX-Labs/zzx-labs-website.git
   cd zzx-labs-website
   ```

2. **Install dependencies** (for the Flask API):

   ```bash
   pip install -r requirements.txt
   ```

3. **Run the Flask app**:

   ```bash
   python api/app.py
   ```

   The Flask app will be running on `http://localhost:5000`.

4. **Start the local mirrored server using Docker** (optional):

   ```bash
   docker-compose up --build
   ```

   This will spin up local servers based on the configuration in `docker-compose.yml`.

5. **Access the site locally** by opening `http://localhost:8080` in your browser.

### Setting Up Web Hosting

1. **Choose a DDNS provider** like [No-IP](https://www.noip.com) or [Hostinger](https://www.hostinger.com).

2. **Set up your domain** and point it to the IP address of your server or local machine.

3. **Configure nginx** with the appropriate domain settings in `nginx.conf` for deployment.

4. **Set up Cloudflare** for DNS management, SSL certificates, and caching.

### Setting Up Bitcoin Payments

1. **Install a Bitcoin payment gateway** or integrate directly with a service like Coinbase or BTCPay Server for processing payments.

2. **Modify `bitcoin_payment.py`** in the API directory to integrate the chosen payment service. This will allow you to render paid services for users once a payment is confirmed.

3. **Test payments** using a Bitcoin wallet, ensuring that transactions trigger the correct services.

### Mirrored Server Setup

You can set up your mirrored servers using the following steps:

1. **For the Windows 10 desktop**: Install nginx, Python, Flask, and necessary dependencies.
   
2. **For Raspberry Pi**: Set up a Raspberry Pi with Docker, nginx, and Python.

3. **For the Dell PowerEdge 730d**: Set up a server environment with nginx and Python.

Each server can pull the latest code from the GitHub repository automatically using Git, allowing you to mirror the content and test the latest version of the website.

### Deploying to Production

1. **Push changes to GitHub**:

   ```bash
   git push origin main
   ```

2. **Sync your servers**: Pull the latest updates to the mirrored servers using Git or deploy manually.

3. **Verify live site**: Once synced, verify the live site is running correctly at your custom domain.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Acknowledgments

- Thanks to [Flask](https://flask.palletsprojects.com/) for providing the framework for building the API.
- Thanks to [Cloudflare](https://www.cloudflare.com) for security and DNS management.
- Thanks to [nginx](https://www.nginx.com) for serving the website locally and in production.

