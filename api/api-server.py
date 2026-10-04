from flask import Flask, jsonify, send_from_directory, request, redirect, url_for
from flask_restful import Api, Resource
from feedgen.feed import FeedGenerator
import os
import json
import bitcoinlib
from bitcoinlib.wallets import Wallet
from bitcoinlib.services.services import BitcoinAPI
import time

app = Flask(__name__)
api = Api(app)

# Example directory structure for blog posts and downloads
BLOG_POSTS_DIR = os.path.join(os.getcwd(), 'blog_posts')
DOWNLOADS_DIR = os.path.join(os.getcwd(), 'downloads')
SERVICES_DIR = os.path.join(os.getcwd(), 'services')
BITCOIN_WALLET = "your-wallet-name"  # Replace with your actual wallet name

# -------- RSS Feed API --------
class RSSFeed(Resource):
    def get(self):
        fg = FeedGenerator()
        fg.title("My Website Blog")
        fg.link(href='http://example.com', rel='self')
        fg.description("Latest posts from our blog")

        # Loop through all blog posts and add them to the feed
        for filename in os.listdir(BLOG_POSTS_DIR):
            if filename.endswith(".md"):  # assuming markdown files for blog posts
                post_path = os.path.join(BLOG_POSTS_DIR, filename)
                with open(post_path, 'r') as post_file:
                    post_content = post_file.read()
                    post_title = filename.split('.')[0]  # use filename as title
                    post_link = f"http://example.com/blog/{post_title}"
                    post_description = post_content[:200]  # first 200 chars as description

                    fe = fg.add_entry()
                    fe.title(post_title)
                    fe.link(href=post_link)
                    fe.description(post_description)

        # Return the generated RSS feed
        return fg.rss_str()

# -------- Download API --------
class Download(Resource):
    def get(self, filename):
        try:
            # Check if file exists in the downloads directory
            if os.path.exists(os.path.join(DOWNLOADS_DIR, filename)):
                return send_from_directory(DOWNLOADS_DIR, filename)
            else:
                return {"message": "File not found"}, 404
        except Exception as e:
            return {"message": str(e)}, 500

# -------- Services API --------
class Services(Resource):
    def get(self):
        try:
            # Load services from JSON or other data source
            with open(os.path.join(SERVICES_DIR, 'services.json')) as services_file:
                services_data = json.load(services_file)
                return services_data
        except Exception as e:
            return {"message": f"Error loading services: {str(e)}"}, 500

# -------- Bitcoin Payment API --------
class BitcoinPayment(Resource):
    def post(self):
        try:
            # Get the service and amount from the request
            data = request.get_json()
            service_id = data.get('service_id')
            amount = data.get('amount')

            # Create or access your Bitcoin wallet
            wallet = Wallet(BITCOIN_WALLET)

            # Generate a Bitcoin invoice (address & amount)
            address = wallet.get_key().address
            invoice = {
                "address": address,
                "amount": amount,
                "service_id": service_id,
                "status": "pending"
            }

            # You can integrate more advanced Bitcoin payment features here,
            # like monitoring for transaction confirmation, etc.

            # Simulate waiting for payment (you should implement actual monitoring)
            time.sleep(5)

            # Once the payment is made, we return a success response
            invoice['status'] = 'paid'
            return jsonify({"message": "Payment successful", "invoice": invoice})
        except Exception as e:
            return jsonify({"message": f"Payment failed: {str(e)}"}), 500

# Register resources for the Flask API
api.add_resource(RSSFeed, '/api/rss')
api.add_resource(Download, '/api/download/<string:filename>')
api.add_resource(Services, '/api/services')
api.add_resource(BitcoinPayment, '/api/pay/bitcoin')

# -------- Running the Application --------
if __name__ == "__main__":
    app.run(debug=True)

