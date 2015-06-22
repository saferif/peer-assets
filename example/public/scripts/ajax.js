function Ajax() {
	this.xhr = new XMLHttpRequest();
}
Ajax.prototype.connect = function(url, callback) {
	var that = this;
	this.xhr.open("GET", url, true);
	this.xhr.responseType = "arraybuffer";
	this.xhr.overrideMimeType("text/plain; charset=x-user-defined");
	this.xhr.onreadystatechange = function() {
		if (that.xhr.readyState == 4) {
			callback(that.xhr);
		}
	}
	this.xhr.send(null);
};