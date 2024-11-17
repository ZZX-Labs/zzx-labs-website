import os
from flask import Blueprint, send_from_directory

downloads = Blueprint('downloads', __name__)

@downloads.route('/download/<filename>', methods=['GET'])
def download_file(filename):
    file_path = os.path.join('/path/to/downloads', filename)
    if os.path.exists(file_path):
        return send_from_directory('/path/to/downloads', filename, as_attachment=True)
    return jsonify({"error": "File not found"}), 404
