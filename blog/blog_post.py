import os

# List of blog post titles (in chronological order)
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

# Function to read .txt content, image, and generate an HTML page
def generate_html(post_title, post_date, post_content, image_path, post_dir):
    # Check if the image file exists
    if not os.path.exists(image_path):
        image_tag = ""  # No image if file doesn't exist
    else:
        image_tag = f'<img src="{image_path}" alt="{post_title} image" style="width: 100%; height: auto;">'

    # Create an HTML template for the blog post, including the image if available
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
        {image_tag}
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
    file_path = os.path.join(post_dir, file_name)

    # Write the HTML content to a file
    with open(file_path, "w") as file:
        file.write(html_template)

# Set a default post date for all blog posts
post_date = "January 15, 2025"  # You can adjust the date or use dynamic dates if necessary

# Create blog post directories and generate HTML pages
for i, title in enumerate(post_titles):
    # Format numeric directory name (0000, 0001, 0002, ...)
    post_dir = os.path.join("blog_posts", f"{i:04d}")
    
    # Ensure the directory exists
    os.makedirs(post_dir, exist_ok=True)
    
    try:
        # Read the content from the .txt file
        txt_file_path = os.path.join(post_dir, f"{title.lower().replace(' ', '_')}.txt")
        with open(txt_file_path, "r") as file:
            content = file.read()

        # Check for the image file in the same directory (adjust image file name if needed)
        image_path = os.path.join(post_dir, "image.jpg")  # Assuming the image is named 'image.jpg'

        # Generate the HTML page for each post
        generate_html(title, post_date, content, image_path, post_dir)

    except FileNotFoundError:
        print(f"Error: {title}.txt or image not found in {post_dir}!")
