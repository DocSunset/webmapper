'use strict';

class Tooltip {
    constructor() {
        $('body').append("<div id='tooltip'></div>");
        this._div = $('#tooltip');
        this.margin = 20;
    }

    showTable(header, data, x, y) {
        this._div.stop(true, false)
                 .empty()
                 .append(Tooltip._makeInfoTable(header, data))
                 .css({})
                 .css({'left': this._hPosition(x, 20),
                       'top': this._vPosition(y, 0),
                       'opacity': 1});
    }

    hide(immediate) {
        var dur = 200;
        if (immediate) dur = 0;
        this._div.animate({opacity: 0}, {duration: dur});
    }

    showBrief(line, x, y) {
        this._div.stop(true, false)
                 .empty()
                 .text(line)
                 .css({})
                 .css({'left': this._hPosition(x, 10),
                       'top': this._vPosition(y, 60),
                       'opacity': 1})
                 .animate({opacity: 0}, {duration: 2000});
    }

    static _makeInfoTable(h, d) {
        var header = "<tr><th colspan='2'>" + h + "</th></tr>";
        var data = '';
        for (var key in d) {
            if (!d.hasOwnProperty(key)) continue;
            data += "<tr><td>"+key+"</td><td>"+d[key]+"</td></tr>";
        }
        return "<table class=infoTable><tbody>"+header+data+"</tbody>";
    }

    _hPosition(x, offset) {
        let width = this._div.width();
        let space = $(window).width() - x;
        if (space - width <= this.margin + offset) return x - offset - width; 
        else return x + offset;
    }

    _vPosition(y, offset) {
        let height = this._div.height();
        let space = $(window).height() - y;
        if (space - height <= this.margin + offset) return y - height - offset;
        else return y + offset;
    }


}