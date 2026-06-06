#!/usr/bin/env python
from cherrypy import tools
import cherrypy
from sentence_transformers import SentenceTransformer
#import clip
import json
import sys
from PIL import Image

model = SentenceTransformer('clip-ViT-B-32')

#blank_emb = model.encode(Image.open("blank.png"))

class TextApp(object):
    exposed = True

    @cherrypy.tools.json_out()
    def GET(self, text):
        text_emb = model.encode(text)
        return {
                "inner": [x.item() for x in text_emb]
        }

@cherrypy.expose
class ScoringApp(object):
    exposed = True
    def __init__(self):
        self.text = TextApp()

    @cherrypy.tools.json_out()
    def GET(self, path):
        #prompt = "a simple doodle of " + sys.argv[1]
        #text_emb = model.encode(prompt)
        #img_emb = model.encode("../frontend/drawings/" + path)
        with Image.open(path) as f:
            img_emb = model.encode(f)
        #"inner": sum(list([(x).item()**2 for x in (img_emb - info["offset"] - text_emb)]))
        #info = json.load(open("offsets.json"))
        return {
                "inner": [x.item() for x in img_emb]
        }

if __name__ == '__main__':
    cherrypy.server.socket_host = '127.0.0.1'
    cherrypy.server.socket_port = 9991
    cherrypy.server.shutdown_timeout = 1
    conf = {
        '/': {
            'request.dispatch': cherrypy.dispatch.MethodDispatcher(),
        }
    }
    webapp = ScoringApp()
    cherrypy.quickstart(webapp, '/', conf)

