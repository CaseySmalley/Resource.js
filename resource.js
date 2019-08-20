/*
   Copyright 2019 Casey Smalley

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/

var resource = function() {

	"use strict";

	var config = {
		main_src: null,
		use_cyclic_check: false,
		use_module_inspection: false,
	};

	var args = null;
	var args_current = 0;

	function init_args(new_args) {
		args = new_args;
		args_current = 0;
	}

	function get_arg(type) {
		if (!args || args_current === args.length) {
			return undefined;
		}

		var arg = args[args_current];
		var is_string = typeof(type) === "string";

		if ((is_string && typeof(arg) === type) || (!is_string && arg instanceof type)) {
			++args_current;
			return arg;
		} else {
			return undefined;
		}
	}

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
		var bundled_constructor = null;
		
		if (typeof(base) === "array") {
			for (var i = 0; i < base.length; ++i) {
				var base_prototype = base[i].prototype;

				for (var property in base_prototype) {
					if (prototype[property] === undefined) {
						prototype[property] = base_prototype[property];
					}
				}
			}

			bundled_constructor = function() {
				for (var i = 0; i < base.length; ++i) {
					base[i].apply(this,arguments);
				}

				constructor.apply(this,arguments);
			}

			bundled_constructor.super = base;
		} else {
			for (var property in base.prototype) {
				if (prototype[property] === undefined) {
					prototype[property] = base.prototype[property];
				}
			}

			bundled_constructor = function() {
				base.apply(this,arguments);
				constructor.apply(this,arguments);
			}

			bundled_constructor.super = [base];
		}

		constructor.super = bundled_constructor.super;
		prototype.super = bundled_constructor.super;
		bundled_constructor.prototype = prototype;
		constructor.prototype = prototype;

		return bundled_constructor;
	}

	var could_derrive_from = [];

	function is_derrived_from(base,constructor) {
		if (!constructor.super) {
			return false;
		}

		could_derrive_from.length = 0;

		for (var i = 0; i < constructor.super.length; ++i) {
			could_derrive_from.push(constructor.super[i]);
		}

		while(could_derrive_from.length) {
			var current = could_derrive_from.pop();
			var _super = current.super;

			if (current === base) {
				return true;
			}

			if (_super) {
				for (var i = 0; i < _super.length; ++i) {
					could_derrive_from.push(_super[i]);
				}
			}
		}

		return false;
	}

	var Resource_Node = _class_(
		function(id,url,get) {
			this.id = id;
			this.url = url;
			this.get = get;
			this.type = null;
			this.callback = null;
			this.status = false;
			this.export = null;
			this.dependencies = [];
			this.dependents = 0;
			this.temp_dependents = 0;
		},{
			
		}
	);

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


	function check_for_cyclic_dependencies() {
		var undepended_nodes = [];
		var total_connections = 0;

		for (var url in resource_node_graph) {
			var node = resource_node_graph[url];

			node.temp_dependents = node.dependents;
			total_connections += node.dependents;

			if (!node.dependents) {
				undepended_nodes.push(node);
			}
		}

		while(undepended_nodes.length) {
			var node = undepended_nodes.pop();

			for (var i = 0; i < node.dependencies.length; ++i) {
				var dependent_node = resource_node_graph[node.dependencies[i]];

				if (dependent_node) {
					--dependent_node.temp_dependents;
					--total_connections;

					if (!dependent_node.temp_dependents) {
						undepended_nodes.push(dependent_node);
					}
				}
			}
		}

		if (total_connections) {
			error("cyclic dependency detected");
		}
	}

	function check_active_requests() {
		if (config.use_cyclic_check) {
			check_for_cyclic_dependencies();
		}
		
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
			error("couldn't load text '%s'",node.id);
		}

		node.status = true;
		node.export = text;

		check_active_requests();
	}

	function create_text_node(id,url) {
		var node = new Resource_Node(id,url,get_export);

		ajax(
			"GET",
			"text/plain; charset=utf-8",
			"text",
			id,
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
			error("couldn't load json '%s'",node.id);
		}

		node.status = true;
		node.export = json;

		check_active_requests();
	}

	function create_json_node(id,url) {
		var node = new Resource_Node(id,url,get_json_export);

		ajax(
			"GET",
			"text/plain; charset=utf-8",
			"text",
			id,
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
			error("couldn't load blob '%s'",node.id);
		}

		node.status = true;
		node.export = URL.createObjectURL(blob);

		check_active_requests();
	}

	function create_blob_node(id,type,url) {
		var node = new Resource_Node(id,url,get_blob_export);
		node.type = type;

		ajax(
			"GET",
			"*/*",
			"blob",
			id,
			null,
			on_blob_loaded.bind(null,node)
		);

		return node;
	}

	function on_css_loaded(node,css) {
		if (!css) {
			error("couldn't load css '%s'",node.id);
		}

		node.status = true;
		node.export = null;

		check_active_requests();
	}

	function create_css_node(id,url) {
		var node = new Resource_Node(id,url,get_export);
		var tag = document.createElement("link");

		tag.rel = "stylesheet";
		tag.type = "text/css";
		tag.href = id;
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

	var next_module_id = null;
	var next_module_node_ids = null;
	var next_module_node_callback = null;

	function define() {
		init_args(arguments);
		next_module_id = get_arg("string");
		next_module_node_ids = get_arg(Array) || [];
		next_module_node_callback = get_arg("function");
	}

	define.amd = {};

	function on_js_module_define_done(node) {
		if (!next_module_node_ids
		||  !next_module_node_callback)
		{
			error("Improper module definition for '%s'",node.id);
		}

		node.dependencies = next_module_node_ids;
		node.callback = next_module_node_callback;

		_import_(
			next_module_node_ids,
			on_js_module_request_done.bind(node),
			node.url
		);

		check_active_requests();
	}

	function on_js_module_code_loaded(node,code) {
		if (!code) {
			error("couldn't load js module '%s'",node.id);
		}

		var blob = new Blob([code],{ type: "text/javascript" });
		var tag = document.createElement("script");

		tag.type = "text/javascript";
		tag.onload = on_js_module_define_done.bind(null,node);
		tag.src = URL.createObjectURL(blob);

		document.head.append(tag);
	}

	function create_js_module_node(id,url) {
		var node = new Resource_Node(id,url,get_export);

		if (config.use_module_inspection) {
			ajax(
				"GET",
				"text/plain; charset=utf-8",
				"text",
				id,
				null,
				on_js_module_code_loaded.bind(null,node)
			);
		} else {
			var tag = document.createElement("script");

			tag.type = "text/javascript";
			tag.onload = on_js_module_define_done.bind(null,node);
			tag.src = id;

			document.head.append(tag);
		}

		return node;
	}

	var import_regex = new RegExp("^(?:(.*)[\\/])?([a-zA-Z\-_]+)(?:\.([a-zA-Z_]+))?$","");
	var import_types = {
		"text": {extensions: ["txt"], create_node: create_text_node},
		"json": {extensions: ["json"], create_node: create_json_node},
		"image": {extensions: ["bmp","png","gif","jpeg","jpg"], create_node: create_blob_node.bind(null,"img")},
		"audio": {extensions: ["mp3","ogg","wav"], create_node: create_blob_node.bind(null,"audio")},
		"video": {extensions: ["mp4","avi"], create_node: create_blob_node.bind(null,"video")},
		"css": {extensions: ["css"], create_node: create_css_node},
		"slc_module": {extensions: ["slc","c"], create_node: null},
		"js_module": {extensions: ["js"], create_node: create_js_module_node}
	};

	var id_seperator_regex = new RegExp("[\\\/]","");

	function parse_id(url,id) {
		var id_tokens = id.split(id_seperator_regex);
		var url_tokens = null;

		if (url && (id_tokens[0] === "." || id_tokens[0] === "..")) {
			url_tokens = url.split(id_seperator_regex);
		} else {
			url_tokens = [];
		}

		for (var i = 0; i < id_tokens.length; ++i) {
			var token = id_tokens[i];

			switch(token) {
				case ".":
					
				break;
				
				case "..":
					url_tokens.pop();
				break;

				default:
					url_tokens.push(token);
				break;
			}
		}

		return url_tokens.join("/");
	}

	function _import_(ids,callback,module_url) {
		if (!ids.length) {
			callback();
			return;
		}

		var pure_urls = [];

		for (var i = 0; i < ids.length; ++i) {
			var id = ids[i];
			var type = import_types[id];
			
			if (type) {
				id = ids[++i];
			}
		
			var match = parse_id(module_url,id).match(import_regex);
			
			if (!match) {
				error("Invalid resource ID '%s'",id);
			}

			var node_id = match[0];
			var node_url = match[1];
			var node_name = match[2];
			var node_extension = match[3];

			if (!type) {
				if (node_extension) {
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
					node_id += ".js";
					type = import_types["js_module"];
				}
			}

			if (!type) {
				error("Unsupported import type");
			} else if (!resource_node_graph[node_id]) {
				resource_node_graph[node_id] = type.create_node(node_id,node_url);
			}

			if (module_url) {
				++resource_node_graph[node_id].dependents;
			}

			pure_urls.push(node_id);
		}

		resource_active_requests.push(new Resource_Request(pure_urls,callback));
	}

	void function() {
		var scripts = document.getElementsByTagName("script");
		var hyphen_regex = new RegExp("_","g");

		for (var i = 0; i < scripts.length; ++i) {
			var script = scripts[i];
			var src_attribute = script.getAttribute("src");

			if (src_attribute && src_attribute.toLowerCase().indexOf("resource.js") !== -1) {
				for (var key in config) {
					var attribute_key = key.replace(hyphen_regex,"-");
					var value =  script.getAttribute(attribute_key)
						  || script.hasAttribute(attribute_key);

					if (value) {
						config[key] = value;
					}
				}
			}
		}

		if (config.main_src) {
			var script = document.createElement("script");
			
			script.type = "text/javascript";
			script.src = config.main_src;

			document.head.append(script);
		}
	}();

	return {
		init_args: init_args,
		get_arg: get_arg,
		format_string: format_string,
		log: log,
		warn: warn,
		error: error,
		ajax: ajax,
		class: _class_,
		class_extends: class_extends,
		is_derrived_from: is_derrived_from,
		import: _import_,
		define: define
	};

}();

window.define = resource.define;
