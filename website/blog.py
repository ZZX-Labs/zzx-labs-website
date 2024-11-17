from flask import Blueprint, jsonify, request
from datetime import datetime

# Assuming a simple in-memory storage or a database is configured
blog_posts = [
    {"id": 1, "title": "First Blog Post", "content": "Content of the first blog post", "date": str(datetime.now())},
    {"id": 2, "title": "Second Blog Post", "content": "Content of the second blog post", "date": str(datetime.now())}
]

blog_api = Blueprint('blog_api', __name__)

@blog_api.route('/posts', methods=['GET'])
def get_blog_posts():
    return jsonify(blog_posts)

@blog_api.route('/post/<int:post_id>', methods=['GET'])
def get_blog_post(post_id):
    post = next((post for post in blog_posts if post['id'] == post_id), None)
    if post:
        return jsonify(post)
    return jsonify({"error": "Post not found"}), 404

@blog_api.route('/post', methods=['POST'])
def create_blog_post():
    new_post = request.get_json()
    blog_posts.append(new_post)
    return jsonify(new_post), 201
