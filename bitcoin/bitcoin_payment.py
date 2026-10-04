from coinbase.wallet.client import Client
from flask import Blueprint, jsonify

# Initialize the Coinbase client with your API key and secret
client = Client('your_api_key', 'your_api_secret')

bitcoin_payment = Blueprint('bitcoin_payment', __name__)

@bitcoin_payment.route('/payment', methods=['POST'])
def create_bitcoin_payment():
    # Create a Bitcoin payment request
    charge = client.create_charge(name="Service Payment", description="Payment for ZZX Labs services", pricing_type="fixed_price", local_price={"amount": "100.00", "currency": "USD"})
    return jsonify(charge)

@bitcoin_payment.route('/payment/<charge_id>', methods=['GET'])
def get_bitcoin_payment_status(charge_id):
    charge = client.get_charge(charge_id)
    return jsonify(charge)
