import os

# List of blog post titles
post_titles = [
    "Cybersecurity Trends in 2024", 
    "Cybersecurity Trends in 2025",
    "Tech Startups to Watch in 2024", 
    "Tech Startups to Watch in 2025",
    "The Future of 0-Day Exploit Disclosure Innovation", 
    "The Future of 0-Day Exploit Discovery Innovation",
    "The Future of 0-Day Exploit Vulnerability Testing Innovation", 
    "The Future of 0-Day Exploitation Innovation",
    "The Future of AI Innovation", 
    "The Future of Bitcoin & Lightning Network (LN) Innovation",
    "The Future of Bitcoin Algorithmic Trading Innovation", 
    "The Future of Bitcoin Analytics & Forensics for Investigation Innovation",
    "The Future of Cryptography Innovation", 
    "The Future of Cyber Investigation Innovation",
    "The Future of Cybersecurity Innovation", 
    "The Future of Cyberwarfare Innovation",
    "The Future of DL Innovation", 
    "The Future of Data Security (DataSec) Innovation",
    "The Future of Drone Innovation", 
    "The Future of Firmware Development Innovation",
    "The Future of GPT Innovation", 
    "The Future of GPT PDA Innovation",
    "The Future of Generative AI Innovation", 
    "The Future of Hardware Development Innovation",
    "The Future of Information Security (InfoSec) Innovation", 
    "The Future of LLM Innovation",
    "The Future of ML Innovation", 
    "The Future of Malware Analysis Innovation",
    "The Future of Malware Deployment Innovation", 
    "The Future of Malware Development Innovation",
    "The Future of NLP Innovation", 
    "The Future of NN Innovation",
    "The Future of Network Security (NetSec) Innovation", 
    "The Future of OSINT (Open Source Intelligence) Innovation",
    "The Future of OSINT Reporting Innovation", 
    "The Future of Operational Security (OpSec) Innovation",
    "The Future of Quantum Cryptography Innovation", 
    "The Future of Ransomware Analysis Innovation",
    "The Future of Ransomware Deployment Innovation", 
    "The Future of Ransomware Development Innovation",
    "The Future of Robotic Innovation", 
    "The Future of STT Innovation",
    "The Future of Software Development Innovation", 
    "The Future of TTS Innovation",
    "The Future of Web Development Innovation", 
    "The Future of Web Security Innovation"
]

# Function to read .txt content and generate an HTML page
def generate_html(post_title, post_date, post_content):
    # Create an HTML template for the blog post
    html_template = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{post_title}</title>
    <link rel="stylesheet" href="/static/styles.css"> <!-- Link to your site's stylesheet -->
</head>
<body>
    <header>
        <nav>
            <a href="/">Home</a> | <a href="/blog.html">Blog</a>
        </nav>
    </header>

    <section class="container">
        <h1>{post_title}</h1>
        <p>Published on {post_date}</p>
        <article>
            <p>{post_content}</p>
        </article>
    </section>

    <footer>
        <p>&copy; 2025 ZZX-Labs. All rights reserved.</p>
    </footer>
</body>
</html>"""

    # Create the HTML file name based on the post title
    file_name = post_title.lower().replace(" ", "_") + ".html"
    file_path = os.path.join("blog_posts", file_name)

    # Write the HTML content to a file
    with open(file_path, "w") as file:
        file.write(html_template)

# Set a default post date for all blog posts
post_date = "January 15, 2025"  # You can adjust the date or use dynamic dates if necessary

# Iterate through the post titles and create corresponding HTML files
for title in post_titles:
    try:
        # Read the content from the .txt file (make sure the file exists with the correct name)
        txt_file_path = f"{title}.txt".lower().replace(" ", "_")
        with open(txt_file_path, "r") as file:
            content = file.read()

        # Generate the HTML page for each post
        generate_html(title, post_date, content)

    except FileNotFoundError:
        print(f"Error: {title}.txt not found!")
