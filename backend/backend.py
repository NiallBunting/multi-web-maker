from flask import Flask, request, abort
from flask import jsonify
import json
from flask_cors import CORS
from bs4 import BeautifulSoup
import re
import datetime
import hashlib

app = Flask(__name__)
store = {}

class Data:
    def __init__(self, json_data):
        #self.__dict__.update(json_data)
        self.html = ''
        self.css = ''
        self.js = ''
        self.set_css(json_data.get('css', ''))
        self.set_js(json_data.get('js', ''))
        self.set_html(json_data.get('html', ''))
        self.id = None  # Initialize id with a default value
        self.created = datetime.datetime.now()
        
    def set_id(self, id):
        self.id = id

    def set_html(self, html):
        soup = BeautifulSoup(html, 'html.parser')
        for tag in soup.find_all(style=True):
            del tag['style']
        for tag in soup(['script', 'img', 'style', 'svg']):
            tag.decompose()
        for tag in soup.find_all(True):
            for attr in list(tag.attrs):
                if attr.lower().startswith("on"):
                    del tag[attr]
        self.html = str(soup)

    def set_css(self, css):
        cleaned_lines = []
        pattern = re.compile(r'url\([\'"]?.*?\.(svg|png|jpe?g|gif|webp)(\?.*?)?[\'"]?\)', re.IGNORECASE)
        path_pattern = re.compile(r'.*path.*', re.IGNORECASE)
        http_pattern = re.compile(r'.*http.*', re.IGNORECASE)

        for line in css.splitlines():
            if pattern.search(line):
                continue
            if path_pattern.search(line):
                continue
            if http_pattern.search(line):
                continue
            cleaned_lines.append(line)

        self.css = "\n".join(cleaned_lines)

    def set_js(self, js):
        self.js = ""

    def to_json(self):
        split_id = self.id.split('-')

        hashed_id = hashlib.sha256('-'.join(split_id[1:]).encode()).digest().hex()[0:6]

        return {
            'id': f"{self.id.split('-')[0]}-{hashed_id}",
            'css': self.css,
            'js': self.js,
            'html': self.html
        }


@app.route('/', methods=['PUT'])
def handle_put():
    id = request.args.get('id')
    if not id:
        abort(400, description="Missing 'id' query parameter")
    
    json_data = request.get_json()
    data = Data(json_data)

    data.set_id(id)
    store[id] = data

    return f"Stored data for id: {id}\n", 200

@app.route('/', methods=['GET'])
def handle_get():

    current_time = datetime.datetime.now()
    result = []
    keys_to_delete = []
    for key, data in store.items():
        if (current_time - data.created).total_seconds() < 3600:
            result.append(data.to_json())
        else:
            keys_to_delete.append(key)
    
    for key in keys_to_delete:
        del store[key]

    return jsonify(result), 200

# Enable CORS for all origins
CORS(app)

if __name__ == '__main__':
    app.run(port=8081)
