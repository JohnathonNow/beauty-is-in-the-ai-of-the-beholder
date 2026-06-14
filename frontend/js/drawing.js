var canvas;
var context;
var uilayer;
var uicontext;
var strokes = new Array();
var redraw = null;
var redraw_other = null;
var load_drawing = null;

const cssTo32BitColor = function() {
	let ctx;
	return function(cssColor) {
		if (!ctx) {
			ctx = document.createElement('canvas').getContext('2d');
			ctx.canvas.width = 1;
			ctx.canvas.height = 1;
		}
		ctx.clearRect(0, 0, 1, 1);
		ctx.fillStyle = cssColor;
		ctx.fillRect(0, 0, 1, 1);
		const imgData = ctx.getImageData(0, 0, 1, 1);
		return new Uint32Array(imgData.data.buffer)[0];
	};
}();

const gradientColors = [
	"red",
	"brown",
	"SaddleBrown",
	"darkorange",
	"orange",
	"gold",
	"yellow",
	"lightgreen",
	"limegreen",
	"green",
	"teal",
	"lightblue",
	"cyan",
	"blue",
	"indigo",
	"purple",
	"RebeccaPurple",
	"lightcoral",
	"pink",
	"white",
	"gray",
	"black"
];

function clear_canvas() {
	strokes.length = 0;
	context.clearRect(0, 0, context.canvas.width, context.canvas.height);
}

function see_element(element) {
	let container = document.getElementById("drawing-workspace");
	if (!container) return;

	let isRowLayout = window.getComputedStyle(container).flexDirection === 'row';
	let mw;

	if (isRowLayout && window.innerWidth >= 800) {
		let containerWidth = container.clientWidth;
		let controlsWidth = document.getElementById("controls").offsetWidth;
		let maxWidth = containerWidth - controlsWidth - 60; // Extra padding
		let maxHeight = window.innerHeight - container.getBoundingClientRect().top - 60;
		mw = Math.min(maxWidth, maxHeight);
	} else {
		// Fallback for smaller screens where wrap happens or it isn't flex-row
		// Make the canvas as wide as possible, allowing scrolling if it gets too tall
		mw = container.clientWidth - 40;
	}

	if (mw < 100) mw = 100;

	element.style.width = mw + "px";
	element.style.height = mw + "px";
	element.setAttribute('width', mw);
	element.setAttribute('height', mw);

	let uil = document.getElementById('ui-layer');
	if (uil) {
		uil.style.width = mw + "px";
		uil.style.height = mw + "px";
		uil.setAttribute('width', mw);
		uil.setAttribute('height', mw);
	}

	redraw();
}


function on_visible() {
	see_element(canvas);
}

function onload_drawing() {
	var DRAW_MODE;
	var paint;
	var tool = "paint";
	var color = "#000000";
	var size = 5;
	var mode;
	var TRACEBACK = 0;

	var activeShape = "rectangle";
	var activeFont = "Arial";
	var activeTextSize = 20;
	var startX = 0, startY = 0;
	var activeStrokeIndex = -1;
	var clipboardData = null;
	var selectionRect = null;
	var isSelecting = false;
	var isDraggingSelection = false;
	var isRotating = false;
	var isScaling = false;

	let colorpicker = document.getElementById('colorpicker');
	for (const c of gradientColors) {
		let ce = document.createElement("div");
		ce.style["background-color"] = c;
		ce.classList.add("colorchoice");
		ce.onclick = function(e) {
			mode = DRAW_MODE;
			color = c;
			// Select all elements with the class "myClass"
			const elements = document.querySelectorAll('.colorpicked');

			// Loop through the elements and remove the class
			for (const element of elements) {
				element.classList.remove('colorpicked');
			}
			ce.classList.add("colorpicked");
		}
		colorpicker.appendChild(ce);
	}
	canvas = document.getElementById('canvas');
	canvas.width = 512;
	canvas.height = 512;
	context = canvas.getContext("2d");
	uilayer = document.getElementById('ui-layer');
	if (uilayer) {
		uilayer.width = 512;
		uilayer.height = 512;
		uicontext = uilayer.getContext("2d");
	}
	DRAW_MODE = context.globalCompositeOperation;
	mode = DRAW_MODE;
	var touch = function(e){
		e.preventDefault();
		e.stopPropagation();
		TRACEBACK = 0;
		paint = true;
		var b = parseInt(getComputedStyle(e.target).getPropertyValue('border-left-width'));
		var rect = e.target.getBoundingClientRect();
		var touches = e.touches;

		var px, py;
		if (touches) {
			px = (touches[0].clientX - b - rect.left) / context.canvas.clientWidth * 1000;
			py = (touches[0].clientY - b - rect.top) / context.canvas.clientHeight * 1000;
		} else {
			px = (e.clientX - b - rect.left) / context.canvas.clientWidth * 1000;
			py = (e.clientY - b - rect.top) / context.canvas.clientHeight * 1000;
		}

		startX = px;
		startY = py;

		if (tool === "shape") {
			addShapeClick(startX, startY, px, py, color, size, activeShape);
		} else if (tool === "text") {
			let clickedIndex = -1;
			for (let i = strokes.length - 1; i >= 0; i--) {
				if (strokes[i] && strokes[i].o === "text") {
					let rotation = strokes[i].rotation || 0;
					let cx = strokes[i].x;
					let cy = strokes[i].y;
					let dx0 = px - cx;
					let dy0 = py - cy;
					let dx = dx0 * Math.cos(-rotation) - dy0 * Math.sin(-rotation);
					let dy = dx0 * Math.sin(-rotation) + dy0 * Math.cos(-rotation);

					let dx_px = dx * context.canvas.width / 1000;
					let dy_px = dy * context.canvas.height / 1000;

					let text_size = strokes[i].size * context.canvas.height / 1000;
					context.font = text_size + "px " + strokes[i].font;

					if (Math.abs(dx_px) < 20 && dy_px > -text_size/2 - 40 && dy_px < -text_size/2 - 10) { // top handle
						clickedIndex = i;
						isRotating = true;
						isDraggingSelection = false;
						break;
					} else if (Math.abs(dx_px) < context.measureText(strokes[i].text).width / 2 && Math.abs(dy_px) < text_size) {
						clickedIndex = i;
						isRotating = false;
						isDraggingSelection = true;
						break;
					}
				}
			}
			if (clickedIndex !== -1) {
				activeStrokeIndex = clickedIndex;
				document.getElementById("text-input").value = strokes[clickedIndex].text;
			} else {
				let textVal = document.getElementById("text-input").value || "Text";
				addTextClick(px, py, color, activeFont, activeTextSize, textVal);
				activeStrokeIndex = strokes.length - 1;
				isDraggingSelection = true;
				isRotating = false;
			}
		} else if (tool === "select") {
			let clickedIndex = -1;
			for (let i = strokes.length - 1; i >= 0; i--) {
				if (strokes[i] && strokes[i].o === "image" && !strokes[i].deleted) {
					let scaleX = strokes[i].scaleX || 1;
					let scaleY = strokes[i].scaleY || 1;
					let rotation = strokes[i].rotation || 0;

					let w = (strokes[i].w * scaleX * 1000) / context.canvas.width;
					let h = (strokes[i].h * scaleY * 1000) / context.canvas.height;

					let cx = strokes[i].x;
					let cy = strokes[i].y;

					// Un-rotate the point for hit testing
					let dx0 = px - cx;
					let dy0 = py - cy;
					let dx = dx0 * Math.cos(-rotation) - dy0 * Math.sin(-rotation);
					let dy = dx0 * Math.sin(-rotation) + dy0 * Math.cos(-rotation);

					let dx_px = dx * context.canvas.width / 1000;
					let dy_px = dy * context.canvas.height / 1000;

					let unscaled_dx_px = dx_px / scaleX;
					let unscaled_dy_px = dy_px / scaleY;

					let w_px = strokes[i].w;
					let h_px = strokes[i].h;

					if (Math.abs(unscaled_dx_px) < 20 && unscaled_dy_px > -h_px/2 - 40 && unscaled_dy_px < -h_px/2 - 10) {
						clickedIndex = i;
						isRotating = true;
						isDraggingSelection = false;
						isScaling = false;
						break;
					}
					else if (Math.abs(unscaled_dx_px - w_px/2) < 20 && Math.abs(unscaled_dy_px - h_px/2) < 20) {
						clickedIndex = i;
						isScaling = true;
						isRotating = false;
						isDraggingSelection = false;
						break;
					}
					else if (Math.abs(unscaled_dx_px) < w_px/2 && Math.abs(unscaled_dy_px) < h_px/2) {
						clickedIndex = i;
						isDraggingSelection = true;
						isRotating = false;
						isScaling = false;
						break;
					}
				}
			}
			if (clickedIndex !== -1) {
				activeStrokeIndex = clickedIndex;
				isSelecting = false;
				selectionRect = null;
			} else {
				activeStrokeIndex = -1;
				isSelecting = true;
				isDraggingSelection = false;
				isRotating = false;
				isScaling = false;
				selectionRect = {x: px, y: py, w: 0, h: 0};
			}
		} else {
			addClick(px, py, color, size, mode, tool);
		}
		redraw();
	}

	var maybetouch = function(e){
		if (e.buttons == 1 && tool != "flood") {
			touch(e);
		}
		e.preventDefault();
		e.stopPropagation();
	}

	var untouch = function(e){
		e.preventDefault();
		if (tool == "flood") {
			return;
		}
		if (paint) {
			var b = getComputedStyle(this).getPropertyValue('border-left-width');
			b = parseInt(b);
			var touches = e.changedTouches;
			var rect = e.target.getBoundingClientRect();

			var px, py;
			if (touches) {
				px = (touches[0].clientX - b - rect.left) / context.canvas.clientWidth * 1000;
				py = (touches[0].clientY - b - rect.top) / context.canvas.clientHeight * 1000;
			} else {
				px = (e.clientX - b - rect.left) / context.canvas.clientWidth * 1000;
				py = (e.clientY - b - rect.top) / context.canvas.clientHeight * 1000;
			}

			if (tool === "shape") {
				let last = strokes[strokes.length - 1];
				if (last && last.o === "shape") {
					last.x = px;
					last.y = py;
					if (typeof sendDrawing === 'function') sendDrawing();
				}
			} else if (tool === "text") {
				if (activeStrokeIndex !== -1 && strokes[activeStrokeIndex] && strokes[activeStrokeIndex].o === "text") {
					if (isRotating) {
						let cx = strokes[activeStrokeIndex].x;
						let cy = strokes[activeStrokeIndex].y;
						strokes[activeStrokeIndex].rotation = Math.atan2(py - cy, px - cx) + Math.PI/2;
					} else if (isDraggingSelection) {
						strokes[activeStrokeIndex].x = px;
						strokes[activeStrokeIndex].y = py;
					}
					if (typeof sendDrawing === 'function') sendDrawing();
				}
			} else if (tool === "select") {
				if (isSelecting && selectionRect) {
					selectionRect.w = px - selectionRect.x;
					selectionRect.h = py - selectionRect.y;
				} else if (activeStrokeIndex !== -1 && strokes[activeStrokeIndex]) {
					if (isDraggingSelection) {
						strokes[activeStrokeIndex].x = px;
						strokes[activeStrokeIndex].y = py;
					} else if (isRotating) {
						let cx = strokes[activeStrokeIndex].x;
						let cy = strokes[activeStrokeIndex].y;
						strokes[activeStrokeIndex].rotation = Math.atan2(py - cy, px - cx) + Math.PI/2;
					} else if (isScaling) {
						let cx = strokes[activeStrokeIndex].x;
						let cy = strokes[activeStrokeIndex].y;
						let rotation = strokes[activeStrokeIndex].rotation || 0;

						let dx0 = px - cx;
						let dy0 = py - cy;
						let dist_x = Math.abs(dx0 * Math.cos(-rotation) - dy0 * Math.sin(-rotation));
						let dist_y = Math.abs(dx0 * Math.sin(-rotation) + dy0 * Math.cos(-rotation));

						let unscaled_w_1000 = (strokes[activeStrokeIndex].w * 1000) / context.canvas.width;
						let unscaled_h_1000 = (strokes[activeStrokeIndex].h * 1000) / context.canvas.height;

						strokes[activeStrokeIndex].scaleX = dist_x * 2 / unscaled_w_1000;
						strokes[activeStrokeIndex].scaleY = dist_y * 2 / unscaled_h_1000;
					}
					if (typeof sendDrawing === 'function') sendDrawing();
				}
			} else {
				addClick(px, py, color, size, mode, tool, true);
			}
			redraw();
		}
	}

	function pencil()
	{
		mode = DRAW_MODE;
		tool = "paint";
	}

	function erase()
	{
		color = "rgba(0,0,0,1)";
		mode = "destination-out";
		tool = "paint";
	}

	function flood()
	{
		tool = "flood";
	}

	function selectTool(t) {
		tool = t;
		document.getElementById("selection-options").style.display = t === "select" ? "block" : "none";
		document.getElementById("text-options").style.display = t === "text" ? "block" : "none";
		document.getElementById("shape-options").style.display = t === "shape" ? "block" : "none";

		const toolIds = ["pencil", "erase", "flood", "select", "text", "shape"];
		for (let id of toolIds) {
			let btn = document.getElementById(id);
			if (btn) btn.classList.remove("active-tool");
		}
		let activeId = t;
		if (t === "paint") activeId = "pencil";
		let activeBtn = document.getElementById(activeId);
		if (activeBtn) activeBtn.classList.add("active-tool");
	}


	function undo()
	{
		if (strokes.length > 0) {
			var len = strokes.length;
			strokes = strokes.slice(0, strokes[strokes.length - 1]["t"]);
			redraw();
			gUndo(strokes.length - len);
		}
	}

	function addClick(x, y, c, s, m, t, dragging)
	{
		strokes.push({ "x": x,
			"y": y,
			"c": c,
			"s": s,
			"m": m,
			"o": t,
			"d": dragging,
			"t": --TRACEBACK});
	}

	function addShapeClick(sx, sy, x, y, c, s, shape) {
		strokes.push({
			"sx": sx,
			"sy": sy,
			"x": x,
			"y": y,
			"c": c,
			"s": s,
			"o": "shape",
			"shape": shape,
			"t": --TRACEBACK
		});
		if (typeof sendDrawing === 'function') sendDrawing();
	}

	function addTextClick(x, y, c, font, size, text) {
		strokes.push({
			"x": x,
			"y": y,
			"c": c,
			"size": size,
			"font": font,
			"text": text,
			"rotation": 0,
			"o": "text",
			"t": --TRACEBACK
		});
		if (typeof sendDrawing === 'function') sendDrawing();
	}

	function addImageClick(x, y, imgData, w, h) {
		strokes.push({
			"x": x,
			"y": y,
			"imgData": imgData,
			"w": w,
			"h": h,
			"scaleX": 1,
			"scaleY": 1,
			"rotation": 0,
			"o": "image",
			"t": --TRACEBACK
		});
		if (typeof sendDrawing === 'function') sendDrawing();
	}

	redraw = function(){
		redraw_other(context, strokes);
	}

	let imageCache = new Map();
	redraw_other = function(ctx, stks){
		//return;
		ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
		ctx.lineJoin = "round";
		if (typeof uicontext !== 'undefined' && uicontext) {
			uicontext.clearRect(0, 0, uicontext.canvas.width, uicontext.canvas.height);
		}

		for(var i=0; i < stks.length; i++) {		
			if (!stks[i] || stks[i].deleted) continue;
			if (stks[i]["o"] == "flood") {
				floodFill(ctx, stks[i]["x"]*ctx.canvas.width/1000, stks[i]["y"]*ctx.canvas.height/1000, cssTo32BitColor(stks[i]["c"]));
			} else if (stks[i]["o"] == "shape") {
				ctx.fillStyle = stks[i]["c"];
				ctx.strokeStyle = stks[i]["c"];
				ctx.lineWidth = stks[i]["s"];
				ctx.globalCompositeOperation = "source-over";
				var stx = stks[i]["sx"] * ctx.canvas.width/1000;
				var sty = stks[i]["sy"] * ctx.canvas.height/1000;
				var enx = stks[i]["x"] * ctx.canvas.width/1000;
				var eny = stks[i]["y"] * ctx.canvas.height/1000;

				ctx.beginPath();
				if (stks[i]["shape"] === "rectangle") {
					ctx.rect(stx, sty, enx - stx, eny - sty);
				} else if (stks[i]["shape"] === "circle") {
					var r = Math.sqrt(Math.pow(enx - stx, 2) + Math.pow(eny - sty, 2));
					ctx.arc(stx, sty, r, 0, 2 * Math.PI);
				} else if (stks[i]["shape"] === "triangle") {
					ctx.moveTo(stx, sty);
					ctx.lineTo(enx, eny);
					ctx.lineTo(stx - (enx - stx), eny);
					ctx.closePath();
				} else if (stks[i]["shape"] === "line") {
					ctx.moveTo(stx, sty);
					ctx.lineTo(enx, eny);
				}
				ctx.stroke();
			} else if (stks[i]["o"] == "text") {
				ctx.fillStyle = stks[i]["c"];
				ctx.globalCompositeOperation = "source-over";
				ctx.save();
				var x = stks[i]["x"] * ctx.canvas.width/1000;
				var y = stks[i]["y"] * ctx.canvas.height/1000;
				ctx.translate(x, y);
				if (stks[i]["rotation"]) {
					ctx.rotate(stks[i]["rotation"]);
				}
				var text_size = stks[i]["size"] * ctx.canvas.height / 1000;
				ctx.font = text_size + "px " + stks[i]["font"];
				ctx.textAlign = "center";
				ctx.textBaseline = "middle";
				ctx.fillText(stks[i]["text"], 0, 0);

				if (tool === "text" && activeStrokeIndex === i && typeof uicontext !== 'undefined' && uicontext) {
					uicontext.save();
					uicontext.translate(x, y);
					if (stks[i]["rotation"]) {
						uicontext.rotate(stks[i]["rotation"]);
					}
					uicontext.strokeStyle = "blue";
					uicontext.fillStyle = "blue";
					uicontext.strokeRect(-ctx.measureText(stks[i]["text"]).width/2 - 5, -text_size/2 - 5, ctx.measureText(stks[i]["text"]).width + 10, text_size + 10);
					uicontext.beginPath();
					uicontext.arc(0, -text_size/2 - 20, 5, 0, 2*Math.PI);
					uicontext.fill();
					uicontext.stroke();
					uicontext.restore();
				}
				ctx.restore();
			} else if (stks[i]["o"] == "delete_rect") {
				ctx.globalCompositeOperation = "destination-out";
				var x = stks[i]["x"] * ctx.canvas.width/1000;
				var y = stks[i]["y"] * ctx.canvas.height/1000;
				var w = stks[i]["w"] * ctx.canvas.width/1000;
				var h = stks[i]["h"] * ctx.canvas.height/1000;
				ctx.fillRect(x, y, w, h);
			} else if (stks[i]["o"] == "image") {
				ctx.globalCompositeOperation = "source-over";
				ctx.save();
				var x = stks[i]["x"] * ctx.canvas.width/1000;
				var y = stks[i]["y"] * ctx.canvas.height/1000;
				ctx.translate(x, y);
				if (stks[i]["rotation"]) {
					ctx.rotate(stks[i]["rotation"]);
				}
				if (stks[i]["scaleX"] && stks[i]["scaleY"]) {
					ctx.scale(stks[i]["scaleX"], stks[i]["scaleY"]);
				}
				let cachedImg = imageCache.get(stks[i]["imgData"]);
				if (cachedImg) {
				    ctx.drawImage(cachedImg, -stks[i]["w"]/2, -stks[i]["h"]/2, stks[i]["w"], stks[i]["h"]);
				} else {
					let img = new Image();
					imageCache.set(stks[i]["imgData"], img);
					img.onload = function() {
						stks[i]["w"] = img.width;
						stks[i]["h"] = img.height;
						redraw();
					}
					img.src = stks[i]["imgData"];
				}

				if (tool === "select" && activeStrokeIndex === i && typeof uicontext !== 'undefined' && uicontext) {
					uicontext.save();
					uicontext.translate(x, y);
					if (stks[i]["rotation"]) {
						uicontext.rotate(stks[i]["rotation"]);
					}
					if (stks[i]["scaleX"] && stks[i]["scaleY"]) {
						uicontext.scale(stks[i]["scaleX"], stks[i]["scaleY"]);
					}

					uicontext.strokeStyle = "blue";
					uicontext.strokeRect(-stks[i]["w"]/2 - 5, -stks[i]["h"]/2 - 5, stks[i]["w"] + 10, stks[i]["h"] + 10);

					uicontext.fillStyle = "blue";
					uicontext.beginPath();
					uicontext.arc(0, -stks[i]["h"]/2 - 20, 5, 0, 2*Math.PI);
					uicontext.fill();
					uicontext.stroke();

					uicontext.beginPath();
					uicontext.arc(stks[i]["w"]/2, stks[i]["h"]/2, 5, 0, 2*Math.PI);
					uicontext.fill();
					uicontext.stroke();
					uicontext.restore();
				}

				ctx.restore();
			} else {
				var sss = stks[i]["s"];
				ctx.fillStyle = stks[i]["c"];
				ctx.globalCompositeOperation = stks[i]["m"];
				ctx.imageSmoothingEnabled = false;
				var stx = (stks[i]["d"] && i ? stks[i-1]["x"] : stks[i]["x"]) * ctx.canvas.width/1000;
				var sty = (stks[i]["d"] && i ? stks[i-1]["y"] : stks[i]["y"]) * ctx.canvas.height/1000;;
				var enx = (stks[i]["x"]) * ctx.canvas.width/1000;
				var eny = (stks[i]["y"]) * ctx.canvas.height/1000;
				var dx = enx - stx;
				var dy = eny - sty;
				for (var t = 0; t < 100; t++) {
					var xx = Math.round(stx + (dx * t / 100.0) - sss / 2.0);
					var yy = Math.round(sty + (dy * t / 100.0) - sss / 2.0);
					ctx.fillRect(xx, yy, sss, sss);
				}
			}
		}

		if (tool === "select" && isSelecting && selectionRect && typeof uicontext !== 'undefined' && uicontext) {
			uicontext.globalCompositeOperation = "source-over";
			uicontext.strokeStyle = "rgba(0, 150, 255, 0.8)";
			uicontext.lineWidth = 1;
			uicontext.setLineDash([5, 5]);
			let rx = Math.min(selectionRect.x, selectionRect.x + selectionRect.w) * ctx.canvas.width/1000;
			let ry = Math.min(selectionRect.y, selectionRect.y + selectionRect.h) * ctx.canvas.height/1000;
			let rw = Math.abs(selectionRect.w) * ctx.canvas.width/1000;
			let rh = Math.abs(selectionRect.h) * ctx.canvas.height/1000;
			uicontext.strokeRect(rx, ry, rw, rh);
			uicontext.setLineDash([]);
		}
	}

	load_drawing = function(strks) {
		strokes = strks.map(x => JSON.parse(x));
	}

	document.getElementById("canvas").ontouchstart = document.getElementById("canvas").onmousedown = touch;
	document.getElementById("canvas").onmouseenter = maybetouch;
	document.getElementById("canvas").ontouchmove = document.getElementById("canvas").onmousemove = untouch;
	document.getElementById("canvas").ontouchend = document.getElementById("canvas").onmouseleave = document.getElementById("canvas").onmouseup = function(e) {
		e.preventDefault();
		redraw();
		paint = false;

	};
	document.getElementById("size").onchange = function(e) { 
		size = e.target.value;
	};
	document.getElementById("undo").onclick = undo;
	document.getElementById("pencil").onclick = () => { pencil(); selectTool("paint"); };
	document.getElementById("flood").onclick = () => { flood(); selectTool("flood"); };
	document.getElementById("erase").onclick = () => { erase(); selectTool("erase"); };
	document.getElementById("select").onclick = () => selectTool("select");
	document.getElementById("text").onclick = () => selectTool("text");
	document.getElementById("shape").onclick = () => selectTool("shape");

	document.getElementById("shape-select").onchange = function(e) { activeShape = e.target.value; };
	document.getElementById("font-select").onchange = function(e) { activeFont = e.target.value; };
	document.getElementById("text-size").onchange = function(e) { activeTextSize = e.target.value; };
	document.getElementById("text-input").oninput = function(e) {
		if (activeStrokeIndex !== -1 && strokes[activeStrokeIndex] && strokes[activeStrokeIndex].o === "text") {
			strokes[activeStrokeIndex].text = e.target.value;
			redraw();
			if (typeof sendDrawing === 'function') sendDrawing();
		}
	};

	document.getElementById("copy-btn").onclick = function() {
		if (selectionRect && selectionRect.w !== 0 && selectionRect.h !== 0) {
			let rx = Math.min(selectionRect.x, selectionRect.x + selectionRect.w) * context.canvas.width/1000;
			let ry = Math.min(selectionRect.y, selectionRect.y + selectionRect.h) * context.canvas.height/1000;
			let rw = Math.abs(selectionRect.w) * context.canvas.width/1000;
			let rh = Math.abs(selectionRect.h) * context.canvas.height/1000;

			if (rw > 0 && rh > 0) {
				let tempCanvas = document.createElement('canvas');
				tempCanvas.width = rw;
				tempCanvas.height = rh;
				let tctx = tempCanvas.getContext('2d');
				tctx.drawImage(context.canvas, rx, ry, rw, rh, 0, 0, rw, rh);
				clipboardData = tempCanvas.toDataURL();
				document.getElementById("paste-btn").style.display = "inline-block";
			}
		} else if (activeStrokeIndex !== -1 && strokes[activeStrokeIndex] && strokes[activeStrokeIndex].o === "image") {
			clipboardData = strokes[activeStrokeIndex].imgData;
			document.getElementById("paste-btn").style.display = "inline-block";
		}
	};

	document.getElementById("delete-btn").onclick = function() {
		if (selectionRect && selectionRect.w !== 0 && selectionRect.h !== 0) {
			let rx = Math.min(selectionRect.x, selectionRect.x + selectionRect.w);
			let ry = Math.min(selectionRect.y, selectionRect.y + selectionRect.h);
			let rw = Math.abs(selectionRect.w);
			let rh = Math.abs(selectionRect.h);

			strokes.push({
				"x": rx, "y": ry, "w": rw, "h": rh,
				"o": "delete_rect",
				"t": --TRACEBACK
			});
			selectionRect = null;
			isSelecting = false;
			redraw();
			if (typeof sendDrawing === 'function') sendDrawing();
		} else if (activeStrokeIndex !== -1 && strokes[activeStrokeIndex] && (strokes[activeStrokeIndex].o === "image" || strokes[activeStrokeIndex].o === "text")) {
			strokes[activeStrokeIndex].deleted = true;
			activeStrokeIndex = -1;
			redraw();
			if (typeof sendDrawing === 'function') sendDrawing();
		}
	};

	document.getElementById("paste-btn").onclick = function() {
		if (clipboardData) {
			let img = new Image();
			img.onload = function() {
				addImageClick(500, 500, clipboardData, img.width, img.height);
				activeStrokeIndex = strokes.length - 1;
				tool = "select";
				redraw();
			}
			img.src = clipboardData;
		}
	};

	selectTool(tool);

	function getPixel(pixelData, x, y) {
		if (x < 0 || y < 0 || x >= pixelData.width || y >= pixelData.height) {
			return -1;  // impossible color
		} else {
			return pixelData.data[y * pixelData.width + x];
		}
	}

	function floodFill(ctx, xx, yy, fillColor) {
		var x = Math.round(xx);
		var y = Math.round(yy);
		console.log(x, y, fillColor);
		// read the pixels in the canvas
		const imageData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);

		// make a Uint32Array view on the pixels so we can manipulate pixels
		// one 32bit value at a time instead of as 4 bytes per pixel
		const pixelData = {
			width: imageData.width,
			height: imageData.height,
			data: new Uint32Array(imageData.data.buffer),
		};

		// get the color we're filling
		const targetColor = getPixel(pixelData, x, y);

		// check we are actually filling a different color
		if (targetColor !== fillColor) {
			const spansToCheck = [];

			function addSpan(left, right, y, direction) {
				spansToCheck.push({left, right, y, direction});
			}

			function checkSpan(left, right, y, direction) {
				let inSpan = false;
				let start;
				let x;
				for (x = left; x < right; ++x) {
					const color = getPixel(pixelData, x, y);
					if (color === targetColor) {
						if (!inSpan) {
							inSpan = true;
							start = x;
						}
					} else {
						if (inSpan) {
							inSpan = false;
							addSpan(start, x - 1, y, direction);
						}
					}
				}
				if (inSpan) {
					inSpan = false;
					addSpan(start, x - 1, y, direction);
				}
			}

			addSpan(x, x, y, 0);

			while (spansToCheck.length > 0) {
				const {left, right, y, direction} = spansToCheck.pop();

				// do left until we hit something, while we do this check above and below and add
				let l = left;
				for (;;) {
					--l;
					const color = getPixel(pixelData, l, y);
					if (color !== targetColor) {
						break;
					}
				}
				++l

				let r = right;
				for (;;) {
					++r;
					const color = getPixel(pixelData, r, y);
					if (color !== targetColor) {
						break;
					}
				}

				const lineOffset = y * pixelData.width;
				pixelData.data.fill(fillColor, lineOffset + l, lineOffset + r);

				if (direction <= 0) {
					checkSpan(l, r, y - 1, -1);
				} else {
					checkSpan(l, left, y - 1, -1);
					checkSpan(right, r, y - 1, -1);
				}

				if (direction >= 0) {
					checkSpan(l, r, y + 1, +1);
				} else {
					checkSpan(l, left, y + 1, +1);
					checkSpan(right, r, y + 1, +1);
				}     
			}
			// put the data back
			ctx.putImageData(imageData, 0, 0);
		}
	}
}
