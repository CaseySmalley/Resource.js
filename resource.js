/*
	todo:
		- finish class_extends
		- specify main through attribute
		- enable code inspection through attribute
		- enable cyclic dependency checks through attribute
*/

var resource = function() {

	"use strict";

	var format_regex = new RegExp("%(?:(.)([0-9]+))?([dbxfcs])","g");
	
	function format_argument(fill,length,type,argument) {
		switch(type) {
			case "d":
				argument = parseInt(argument).toString();
			break;

			case "b":
				argument = parseInt(argument).toString(2);
			break;

			case "x":
				argument = parseInt(argument).toString(16).toUpperCase();
			break;

			case "f":
				argument = parseFloat(argument).toString();

				if (argument.indexOf(".") === -1) {
					argument += ".0";
				}
			break;

			case "c":
				argument = argument[0];
			break;

			case "s":

			break;

			default:
				console.error("format_argument, unsupported format type '" + type + "'");
			break;
		}

		if (fill && length !== NaN && length > argument.length) {
			return fill.repeat(length - argument.length) + argument;
		} else {
			return argument;
		}
	}


	function format_string(string) {
		if (arguments.length === 1) {
			return string;
		}

		format_regex.lastIndex = 0;

		var result = null;
		var format = null;
		var format_fill = null;
		var format_length = null;
		var format_type = null;
		var substring_start = 0;
		var substring_end = 0;
		var i = 1;
		var out = "";

		while((result = format_regex.exec(string))) {
			format = result[0];
			format_fill = result[1];
			format_length = parseInt(result[2]);
			format_type = result[3];
			substring_end = format_regex.lastIndex - format.length;
			
			if (arguments[i] !== undefined) {
				out += string.substring(substring_start,substring_end)
				    +  format_argument(format_fill,format_length,format_type,arguments[i++].toString());
			} else {
				console.error("format_string, missing argument '" + i.toString() + "'");
			}

			substring_start = format_regex.lastIndex;
		}

		return out + string.substring(substring_start,string.length);
	}

	function log() {
		console.log(format_string.apply(undefined,arguments));
	}

	function warn() {
		console.warn(format_string.apply(undefined,arguments));
	}

	function error() {
		throw format_string.apply(undefined,arguments);
	}

	function ajax_onreadystatechange(callback) {
		if (this.readyState === 4) {
			if (this.status === 200) {
				callback(this.response);
			} else {
				callback(null);
			}
		}
	}

	function ajax(method,mime_type,response_type,url,data,callback) {
		var request = new XMLHttpRequest();

		request.onreadystatechange = ajax_onreadystatechange.bind(request,callback);
		request.responseType = response_type;
		request.overrideMimeType(mime_type);
		request.open(method,url,true);
		request.send(data);

		return request;
	}

	function _class_(constructor,prototype,properties) {
		if (properties) {
			for (var property in properties) {
				constructor[property] = properties[property];
			}
		}
		
		constructor.super = null;
		prototype.super = null;
		constructor.prototype = prototype;

		return constructor;
	}

	function class_extends(base,constructor,prototype,properties) {
		if (typeof(base) === "array") {
			for (var i = 0; i < base.length; ++i) {
				var base_prototype = base[i].prototype;

				for (var property in base_prototype) {
					if (prototype[property] === undefined) {
						prototype[property] = base_prototype[property];
					}
				}
			}
		} else {
			for (var property in base.prototype) {
				if (
			}
		}
	}

	function Resource_Node(url,get) {
		this.url = url;
		this.get = get;
		this.type = null;
		this.callback = null;
		this.status = false;
		this.export = null;
		this.dependencies = [];
		this.dependants = 0;
	}

	var resource_node_graph = {};
	
	function Resource_Request(urls,callback) {
		this.urls = urls;
		this.callback = callback
	}

	var resource_active_requests = [];
	
	function pop_active_request(i) {
		resource_active_requests[i] = resource_active_requests[resource_active_requests.length - 1];
		resource_active_requests.pop();
	}

	function finish_active_request(request) {
		var exports = [];
		var urls = request.urls;

		for (var i = 0; i < urls.length; ++i) {
			var _export_ = resource_node_graph[urls[i]].get();

			if (_export_) {
				exports.push(_export_);
			}
		}

		request.callback.apply(null,exports);
	}

	function check_active_requests() {
		check_active_requests_loop:
		for (var i = 0; i < resource_active_requests.length; ++i) {
			var request = resource_active_requests[i];
			var urls = request.urls;

			for (var j = 0; j < urls.length; ++j) {
				var node = resource_node_graph[urls[j]];

				if (!node.status) {
					continue check_active_requests_loop;
				}
			}

			pop_active_request(i--);
			finish_active_request(request);
		}
	}

	function get_export() {
		return this.export;
	}

	function on_text_loaded(node,text) {
		if (!text) {
			error("couldn't load text '%s'",node.url);
		}

		node.status = true;
		node.export = text;

		check_active_requests();
	}

	function create_text_node(url) {
		var node = new Resource_Node(url,get_export);

		ajax(
			"GET",
			"text/plain; charset=utf-8",
			"text",
			url,
			null,
			on_text_loaded.bind(null,node)
		);

		return node;
	}

	function get_json_export() {
		return JSON.parse(this.export);
	}

	function on_json_loaded(node,json) {
		if (!json) {
			error("couldn't load json '%s'",node.url);
		}

		node.status = true;
		node.export = json;

		check_active_requests();
	}

	function create_json_node(url) {
		var node = new Resource_Node(url,get_json_export);

		ajax(
			"GET",
			"text/plain; charset=utf-8",
			"text",
			url,
			null,
			on_json_loaded.bind(null,node)
		);

		return node;
	}

	function get_blob_export() {
		var tag = document.createElement(this.type);

		tag.src = this.export;
		
		return tag;
	}

	function on_blob_loaded(node,blob) {
		if (!blob) {
			error("couldn't load blob '%s'",node.url);
		}

		node.status = true;
		node.export = URL.createObjectURL(blob);

		check_active_requests();
	}

	function create_blob_node(type,url) {
		var node = new Resource_Node(url,get_blob_export);
		node.type = type;

		ajax(
			"GET",
			"*/*",
			"blob",
			url,
			null,
			on_blob_loaded.bind(null,node)
		);

		return node;
	}

	function on_css_loaded(node,css) {
		if (!css) {
			error("couldn't load css '%s'",node.url);
		}

		node.status = true;
		node.export = null;

		check_active_requests();
	}

	function create_css_node(url) {
		var node = new Resource_Node(url,get_export);
		var tag = document.createElement("link");

		tag.rel = "stylesheet";
		tag.type = "text/css";
		tag.href = url;
		tag.onload = on_css_loaded.bind(null,node,true);
		tag.onerror = on_css_loaded.bind(null,node,false);

		document.head.append(tag);

		return node;
	}

	function on_js_module_request_done() {
		this.status = true;
		this.export = this.callback.apply(null,arguments);

		check_active_requests();
	}

	var next_module_node_urls = null;
	var next_module_node_callback = null;

	function define(urls,callback) {
		next_module_node_urls = urls;
		next_module_node_callback = callback;
	}

	function on_js_module_define_done(node) {
		if (!next_module_node_urls
		||  !next_module_node_callback)
		{
			error("Improper module definition for '%s'",node.url);
		}

		node.dependencies = next_module_node_urls;
		node.callback = next_module_node_callback;

		_import_(
			next_module_node_urls,
			on_js_module_request_done.bind(node)
		);
	}

	function on_js_module_code_loaded(node,code) {
		if (!code) {
			error("couldn't load js module '%s'",node.url);
		}

		var blob = new Blob([code],{ type: "text/javascript" });
		var tag = document.createElement("script");

		tag.type = "text/javascript";
		tag.onload = on_js_module_define_done.bind(null,node);
		tag.src = URL.createObjectURL(blob);

		document.head.append(tag);
	}

	function create_js_module_node(url) {
		var node = new Resource_Node(url,get_export);

		ajax(
			"GET",
			"text/plain; charset=utf-8",
			"text",
			url,
			null,
			on_js_module_code_loaded.bind(null,node)
		);

		return node;
	}

	var import_type_regex = new RegExp("\\.([a-zA-Z0-9_]+)$","");
	var import_types = {
		"text": {extensions: ["txt"], create_node: create_text_node},
		"json": {extensions: ["json"], create_node: create_json_node},
		"image": {extensions: ["bmp","png","gif","jpeg","jpg"], create_node: create_blob_node.bind(null,"img")},
		"audio": {extensions: ["mp3","ogg","wav"], create_node: create_blob_node.bind(null,"audio")},
		"video": {extensions: ["mp4","avi"], create_node: create_blob_node.bind(null,"video")},
		"css": {extensions: ["css"], create_node: create_css_node},
		"slc_module": {extensions: ["slc"], create_node: null},
		"js_module": {extensions: ["js"], create_node: create_js_module_node}
	};

	function _import_(urls,callback) {
		if (!urls.length) {
			callback();
			return;
		}

		var pure_urls = [];

		for (var i = 0; i < urls.length; ++i) {
			var url = urls[i];
			var type = import_types[url];

			if (type) {
				url = urls[++i];
			} else {
				var match = url.match(import_type_regex);

				if (match) {
					var extension = match[1].toLowerCase();

					import_types_loop:
					for (var import_type_key in import_types) {
						var import_type = import_types[import_type_key];
						var extensions = import_type.extensions;

						for (var j = 0; j < extensions.length; ++j) {
							if (extension === extensions[j]) {
								type = import_type;
								break import_types_loop;
							}
						}
						
					}
				} else {
					url += ".js";
					type = import_types["js_module"];
				}
			}

			if (!url) {
				error("Missing import URL");
			} else if (!type) {
				error("Unsupported import type");
			} else if (!resource_node_graph[url]) {
				resource_node_graph[url] = type.create_node(url);
			}

			pure_urls.push(url);
		}

		resource_active_requests.push(new Resource_Request(pure_urls,callback));
	}

	return {
		format_string: format_string,
		log: log,
		warn: warn,
		error: error,
		ajax: ajax,
		class: _class_,
		class_extends: class_extends,
		import: _import_,
		define: define
	};

}();

window.define = resource.define;
