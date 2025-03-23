/****************************************************************************
 Copyright (c) 2013-2014 Chukong Technologies Inc.

 http://www.cocos2d-x.org

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
 ****************************************************************************/

ccs._load = (function () {

    /**
     * load file
     * @param {String} file
     * @param {String} [type=] - ccui|node|action
     * @param {String} [path=] - Resource search path
     * @returns {*}
     */
    var load = function (file, type, path) {

        var json = cc.loader.getRes(file);

        if (!json)
            return cc.log("%s does not exist", file);
        var ext = extname(file).toLocaleLowerCase();
        if (ext !== "json" && ext !== "exportjson")
            return cc.log("%s load error, must be json file", file);

        var parse;
        if (!type) {
            if (json["widgetTree"])
                parse = parser["ccui"];
            else if (json["nodeTree"])
                parse = parser["timeline"];
            else if (json["Content"] && json["Content"]["Content"])
                parse = parser["timeline"];
            else if (json["gameobjects"])
                parse = parser["scene"];
        } else {
            parse = parser[type];
        }

        if (!parse) {
            cc.log("Can't find the parser : %s", file);
            return new cc.Node();
        }
        var version = json["version"] || json["Version"];
        if (!version && json["armature_data"]) {
            cc.warn("%s is armature. please use:", file);
            cc.warn("    ccs.armatureDataManager.addArmatureFileInfoAsync(%s);", file);
            cc.warn("    var armature = new ccs.Armature('name');");
            return new cc.Node();
        }
        var currentParser = getParser(parse, version);
        if (!currentParser) {
            cc.log("Can't find the parser : %s", file);
            return new cc.Node();
        }

        return currentParser.parse(file, json, path) || null;
    };

    var parser = {
        "ccui": {},
        "timeline": {},
        "action": {},
        "scene": {}
    };

    load.registerParser = function (name, version, target) {
        if (!name || !version || !target)
            return cc.log("register parser error");
        if (!parser[name])
            parser[name] = {};
        parser[name][version] = target;
    };

    load.getParser = function (name, version) {
        if (name && version)
            return parser[name] ? parser[name][version] : undefined;
        if (name)
            return parser[name];
        return parser;
    };

    //Gets the file extension
    var extname = function (fileName) {
        var arr = fileName.match(extnameReg);
        return ( arr && arr[1] ) ? arr[1] : null;
    };
    var extnameReg = /\.([^\.]+)$/;


    var parserReg = /([^\.](\.\*)?)*$/;
    var getParser = function (parser, version) {
        if (parser[version])
            return parser[version];
        else if (version === "*")
            return null;
        else
            return getParser(parser, version.replace(parserReg, "*"));
    };

    return load;

})();

ccs._parser = cc.Class.extend({

    ctor: function () {
        this.parsers = {};
    },

    _dirnameReg: /\S*\//,
    _dirname: function (path) {
        var arr = path.match(this._dirnameReg);
        return (arr && arr[0]) ? arr[0] : "";
    },

    getClass: function (json) {
        return json["classname"];
    },

    getNodeJson: function (json) {
        return json["widgetTree"];
    },

    parse: function (file, json, resourcePath) {
        resourcePath = resourcePath || this._dirname(file);
        this.pretreatment(json, resourcePath);
        var node = this.parseNode(this.getNodeJson(json), resourcePath, file);
        node && this.deferred(json, resourcePath, node, file);
        return node;
    },

    pretreatment: function (json, resourcePath, file) {
    },

    deferred: function (json, resourcePath, node, file) {
    },

    parseNode: function (json, resourcePath) {
        var parser = this.parsers[this.getClass(json)];
        var widget = null;
        if (parser)
            widget = parser.call(this, json, resourcePath);
        else
            cc.log("Can't find the parser : %s", this.getClass(json));

        return widget;
    },

    registerParser: function (widget, parse) {
        this.parsers[widget] = parse;
    }
});

/**
 * Analysis of studio JSON file
 * The incoming file name, parse out the corresponding object
 * Temporary support file list:
 *   ui 1.*
 *   node 1.* - 2.*
 *   action 1.* - 2.*
 *   scene 0.* - 1.*
 * @param {String} file
 * @param {String} [path=] Resource path
 * @returns {{node: cc.Node, action: cc.Action}}
 */
ccs.load = function (file, path) {
    var object = {
        node: null,
        action: null
    };

    object.node = ccs._load(file, null, path);
    object.action = ccs._load(file, "action", path);
    if (object.action && object.action.tag === -1 && object.node)
        object.action.tag = object.node.tag;
    return object;
};
ccs.load.validate = {};

ccs.load.preload = true;

/**
 * Analysis of studio JSON file and layout ui widgets by visible size.
 * The incoming file name, parse out the corresponding object
 * Temporary support file list:
 *   ui 1.*
 *   node 1.* - 2.*
 *   action 1.* - 2.*
 *   scene 0.* - 1.*
 * @param {String} file
 * @param {String} [path=] Resource path
 * @returns {{node: cc.Node, action: cc.Action}}
 */
ccs.loadWithVisibleSize = function (file, path) {
    var object = ccs.load(file, path);
    var size = cc.director.getVisibleSize();
    if (object.node && size) {
        object.node.setContentSize(size.width, size.height);
        ccui.helper.doLayout(object.node);
    }
    return object;
};

//Forward compatible interface

ccs.actionTimelineCache = {


    //@deprecated This function will be deprecated sooner or later please use ccs.load
    /**
     * Create Timeline Action
     * @param file
     * @returns {*}
     */
    createAction: function (file) {
        return ccs._load(file, "action");
    }
};

ccs.csLoader = {

    //@deprecated This function will be deprecated sooner or later please use ccs.load
    /**
     * Create Timeline Node
     * @param file
     * @returns {*}
     */
    createNode: function (file) {
        return ccs._load(file);
    }
};

cc.loader.register(["json"], {
    load: function (realUrl, url, res, cb) {
        cc.loader.loadJson(realUrl, function (error, data) {
            var path = cc.path;
            if (data && data["Content"] && data["Content"]["Content"]["UsedResources"]) {
                var UsedResources = data["Content"]["Content"]["UsedResources"],
                    dirname = path.dirname(url),
                    list = [],
                    tmpUrl, normalUrl;
                for (var i = 0; i < UsedResources.length; i++) {
                    if (!ccs.load.preload && /\.(png|jpg$)/.test(UsedResources[i]))
                        continue;
                    tmpUrl = path.join(dirname, UsedResources[i]);
                    normalUrl = path._normalize(tmpUrl);
                    if (!ccs.load.validate[normalUrl]) {
                        ccs.load.validate[normalUrl] = true;
                        list.push(normalUrl);
                    }
                }
                cc.loader.load(list, function () {
                    cb(error, data);
                });
            } else {
                cb(error, data);
            }

        });
    }
});

ccs._generateAttribute = function(output, input) {
    output["Name"] = input.getName();

    const color = input.getColor() || cc.color(0, 0, 0, 0);
    output["CColor"] = {
        r: color.r,
        g: color.g,
        b: color.b,
        a: color.a,
    };

    output["Position"] = {
        X: input.getPositionX(),
        Y: input.getPositionY(),
    };

    output["Scale"] = {
        ScaleX: input.getScaleX(),
        ScaleY: input.getScaleY(),
    };

    output["RotationSkewX"] = input.getRotationX();
    output["RotationSkewY"] = input.getRotationY();

    const anchor = input.getAnchorPoint();
    output["AnchorPoint"] = {
        ScaleX: anchor.x,
        ScaleY: anchor.y,
    };

    output["ZOrder"] = input.getLocalZOrder();
    output["VisibleForFrame"] = input.isVisible();

    const size = input.getContentSize();
    output["Size"] = {
        X: size.width,
        Y: size.height,
    };
    output["Alpha"] = input.getOpacity();
    output["Tag"] = input.getTag();
    // output["ActionTag"] = ; // TODO: find a solution for this, it is very likely auto generated from an INT32
    // output["UserData"] = ;
    output["FrameEvent"] = "";

    ccs._generateLayoutComponent(output, input);
}

ccs._generateLayoutComponent = function(output, input) {
    // Logic copied from setLayoutComponent implementation
    const layout = ccui.LayoutComponent.bindLayoutComponent(input);
    if (!layout)
        return;

    output["PrePosition"] = { X: 0, Y: 0 };    
    if(layout.isPositionPercentXEnabled()) {
        output["PositionPercentXEnabled"] = true;
        output["PrePosition"]["X"] = layerComponent.getPositionPercentX();
    }

    if(layout.isPositionPercentYEnabled()) {
        output["PositionPercentYEnabled"] = true;
        output["PrePosition"]["Y"] = layerComponent.getPositionPercentY();
    }

    output["PreSize"] = { X: 0, Y: 0 };
    if(layout.isPercentWidthEnabled()) {
        output["PercentWidthEnable"] = true;
        output["PreSize"]["X"] = layerComponent.getPercentWidth();
    }

    if(layout.isPercentHeightEnabled()) {
        output["PercentHeightEnable"] = true;
        output["PreSize"]["Y"] = layerComponent.getPercentHeight();
    }

    if(layout.isStretchWidthEnabled()) {
        output["StretchWidthEnable"] = true;
    }

    if(layout.isStretchHeightEnabled()) {
        output["StretchHeightEnable"] = true;
    }

    const horizontalEdge = layout.getHorizontalEdge();
    switch(horizontalEdge) {
        case ccui.LayoutComponent.horizontalEdge.LEFT: {
            output["HorizontalEdge"] = "LeftEdge";
        }break;

        case ccui.LayoutComponent.horizontalEdge.RIGHT: {
            output["HorizontalEdge"] = "RightEdge";
        }break;

        case ccui.LayoutComponent.horizontalEdge.CENTER: {
            output["HorizontalEdge"] = "BothEdge";
        }break;

        case ccui.LayoutComponent.horizontalEdge.NONE:
        default: break;
    }

    const verticalEdge = layout.getVerticalEdge();
    switch(verticalEdge) {
        case ccui.LayoutComponent.verticalEdge.TOP: {
            output["VerticalEdge"] = "TopEdge";
        }break;

        case ccui.LayoutComponent.verticalEdge.BOTTOM: {
            output["VerticalEdge"] = "BottomEdge";
        }break;

        case ccui.LayoutComponent.verticalEdge.CENTER: {
            output["VerticalEdge"] = "BothEdge";
        }break;

        case ccui.LayoutComponent.verticalEdge.NONE:
        default: break;
    }
    
    output["LeftMargin"] = layout.getLeftMargin();
    output["RightMargin"] = layout.getRightMargin();
    output["TopMargin"] = layout.getTopMargin();
    output["BottomMargin"] = layout.getBottomMargin();
}

ccs._generateWidgetAttributes = function(output, input) {
    
} 

ccs._serializers = {
    // SingleNodeObjectData for root ObjectData node
    // NodeObjectData for nodes inside ObjectData
    // LayerObjectData if has auto layout 
    // Not used: GameNodeObjectData, GameLayerObjectData
    node: function(node) {
        const outputNode = {};
        ccs._generateAttribute(outputNode, node);
        outputNode["ctype"] = "SingleNodeObjectData";

        return outputNode;
    },

    scene: function(node) {
        const outputNode = {};
        ccs._generateAttribute(outputNode, node);
        outputNode["ctype"] = "SingleNodeObjectData";
        outputNode["Name"] = "Scene";

        return outputNode;
    },

    layer: function(node) {
        const outputNode = {};
        ccs._generateAttribute(outputNode, node);
        outputNode["ctype"] = "LayerObjectData";

        return outputNode;
    },

    // SpriteObjectData: cc.Sprite
    sprite: function(node) {
        const outputNode = {};
        ccs._generateAttribute(outputNode, node);
        outputNode["ctype"] = "SpriteObjectData";

        const blend = node.getBlendFunc();
        if(blend) {
            outputNode["BlendFunc"] = {
                "Src": blend.src,
                "Dst": blend.dst,
            };
        }

        if(node.isFlippedX()) {
            output["FlipX"] = true;
        }

        if(node.isFlippedY()) {
            output["FlipY"] = true;
        }

        const tex = node.getTexture();
        if(tex) {
            // TODO: implement
        }

        return outputNode;
    },

    // ParticleObjectData: cc.ParticleSystem
    particle: function(node) {
    },

    // PanelObjectData: ccui.Layout
    panel: function(node) {

    },
    
    // TextObjectData: ccui.Text
    text: function(node) {
        
    },

    // ButtonObjectData: ccui.Button
    button: function(node) {
        
    },

    // CheckBoxObjectData: ccui.CheckBox
    checkBox: function(node) {
        
    },

    // ScrollViewObjectData: ccui.ScrollView
    scrollView: function(node) {

    },

    // ImageViewObjectData: ccui.ImageView
    imageView: function(node) {

    },

    // LoadingBarObjectData: ccui.LoadingBar
    loadingBar: function(node) {

    },

    // SliderObjectData: ccui.Slider
    slider: function(node) {
          
    },

    // PageViewObjectData: ccui.PageView
    pageView: function(node) {

    },
    
    // ListViewObjectData: ccui.ListView
    listView: function(node) {
        
    },

    // TextAtlasObjectData: ccui.TextAtlas
    textAtlas: function(node) {
    },
    
    // TextBMFontObjectData: ccui.TextBMFont
    textBMF: function(node) {
    },

    // TextFieldObjectData: ccui.TextField
    textField: function(node) {
    },

    // SimpleAudioObjectData: ccs.ComAudio
    simpleObject: function(node) {
    },

    // GameMapObjectData: could be node or cc.TMXTiledMap
    gameMap: function(node) {
    },

    // ProjectNodeObjectData: file data, could be anything
    projectNode: function(node) {
    },

    // ArmatureNodeObjectData: ccs.Armature
    armature: function(node) {
    },

    // BoneNodeObjectData: ccs.Armature
    bone: function(data) {
    },

    // SkeletonNodeObjectData: ccs.Armature
    skeleton: function(node) {
    },
}

ccs._nodeTypeTable = {
    "Scene": ccs._serializers.scene,
    "Node": ccs._serializers.node,
    "Layer": ccs._serializers.layer,
    "Sprite": ccs._serializers.sprite,
    "ParticleSystem": null,

    "Widget": null,
    "Layout": null,
    "Text": null,
    "Button": null,
    "CheckBox": null,
    "ScrollView": null,
    "ImageView": null,
    "LoadingBar": null,
    "Slider": null,
    "PageView": null,
    "ListView": null,
    "TextAtlas": null,
    "TextBMFont": null,
    "TextFieldTTF": null,
    "TMXTiledMap": null,
    
    // NOTE: not sure
    "LabelTTF": null,
    "Menu": null,
    "MenuItem": null,
    "Scale9Sprite": null,
    "ScrollViewBar": null,
    "ClippingNode": null,
    "AtlasNode": null,
    "PageViewIndicator": null,
    
    // NOTE: not implemented
    "LayerColor": null,
    "LayerGradient": null,
    "LayerMultiplex": null,
    "LabelAtlas": null,
    "LabelBMFont": null,
    "MotionStreak": null,
    "Armature": null,
    "Bone": null,
    "Skin": null,
};

// NOTE: returns a node
ccs._serializeNode = function(node) {
    // Assert parent defined
    if(!node) {
        return;
    }

    if(!node._className) {
        console.warn("Node type not found:", node);
    }

    const serializer = ccs._nodeTypeTable[node._className];
    if(!serializer) {
        console.warn("Serializer not found for type:", node.className);
        return;
    }

    const outputNode = serializer(node);
    if(!outputNode) {
        console.warn("Failed to serialize node.", node);
    }

    outputNode.children = [];

    for(let index = 0; 
        index < node.children.length;
        ++index)
    {
        const generatedNode = ccs._serializeNode(node.children[index]);
        if(generatedNode) {
            outputNode.children.push(generatedNode);
        }
    }

    return outputNode;
}

ccs.export = function(root) {
    let output = {};

    output["ID"] = crypto.randomUUID(); // generate UUID
    output["Version"] = "2.0.0.0"; // Version of CocosStudio, but it also affects parsing
    output["Name"] = "MainScene";
    output["Type"] = "Scene"; // Could be something else?
    output["Content"] = {};
    output["Content"]["Content"] = {
        "ObjectData": {},
        "Animation": {},
        "AnimationList": [],
        "ctype": "GameProjectData" // See which one works better, GameNodeObjectData or GameLayerObjectData
    };
    
    if(!root) return;

    output["Content"]["Content"]["ObjectData"] = ccs._serializeNode(root);

    return output;
}
