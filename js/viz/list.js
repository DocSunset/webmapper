// An object for the overall display
function listView(model)
{
    var svgns = 'http://www.w3.org/2000/svg';
    var all_devices = 'All Devices';

    var tabList = null;
    var tabDevices = null;
    var selectedTab = null;
    var leftTable = null;
    var rightTable = null;
    var svgArea = null;
    var selectLists = {};
    var edges = new MapperEdgeArray();
    var tableHeight = 0;

    // The most recently selected rows, for shift-selecting
    var lastSelectedTr = {left: null, right: null};

    var deviceHeaders = ["name", "inputs", "outputs", "address"];
    var signalHeaders = ["name", "type", "length", "units", "min", "max"];

    // "use strict";
    this.type = 'list';
    this.unmappedVisible = true; // Are unmapped devices/signals visible?
    focusedDevices = []; // An array containing devices seen in the display

    var leftBodyContent = [];
    var rightBodyContent = [];

    this.init = function() {
        add_tabs();
        add_title_bar();
        add_display_tables();
        add_svg_area();
        add_status_bar();
        this.add_handlers();
        select_tab(tabDevices);
        $('#container').css({
            'min-width': '700px',
            'min-height': '150px',
            'height': 'calc(100% - 86px)'
        });
        add_model_callbacks();
    };

    this.cleanup = function() {
        // Remove view specific handlers
        $('*').off('.list');
        $(document).off('.list');
    };

    add_model_callbacks = function() {
        model.clear_callbacks();
        model.add_callback(function(obj_type, event, key) {
            switch (obj_type) {
                case 'device':
                    update_devices(key, event);
                    break;
                case 'link':
                    update_links(key, event);
                    break;
                case 'signal':
                    update_signals(key, event);
                    break;
                case 'map':
                    update_maps(key, event);
                    break;
            }
        });
    };

    this.get_save_location = function () {
        if (selectedTab == all_devices){
            // nothing to save if in the devices tab
            return '';
        }
        else {
            return '/save?dev='+encodeURIComponent(selectedTab);
        }
    };

    this.get_selected_tab = function() {
        return selectedTab;
    }

    this.get_focused_devices = function() {
        return focusedDevices;
    };

    this.on_resize = function() {
        tableHeight = $('.tableDiv').height() - $('.tableDiv thead').height();
        rightTable.update_row_heights();
        leftTable.update_row_heights();
        edges.each(adjust_edge);
    };

    // An object for the left and right tables, listing devices and signals
    function listTable(id) {
        this.id = id; // Something like "leftTable"
        this.parent; // The node containing the table
        this.div; // The div node (and status)
        this.table; // The table node itself
        this.headerRow; // The top row node of the table within <thead>
        this.tbody; // The <tbody> node
        this.footer; // The status bar at the bottom

        this.nRows; // Number of rows (e.g. devices or signals) present
        this.nVisibleRows; // Number of rows actually visible to the user
        this.nCols; // Number of columns in table

        // Should be passed a the node for the parent
        this.create_within = function(parent) {
            this.parent = parent;
            // Create the div containing the table
            $(this.parent).append("<div class='tableDiv' id='"+id+"'></div>");
            this.div = $(this.parent).children("#"+this.id);

            // Create the skeleton for the table within the div
            $(this.div).append(
                "<table class='displayTable'>"+
                    "<thead><tr></tr></thead>"+
                    "<tbody></tbody>"+
                "</table>");
            this.table = $(this.div).children('.displayTable')[0];
            this.headerRow = $("#"+this.id+" .displayTable thead tr")[0];
            this.tbody = $("#"+this.id+" .displayTable tbody")[0];

            // Create the header elements
            // This assumes that we do not need more than 5 columns
            // Creating and destroying th elements themselves screws up tablesorter
            for (var i = 0; i < 6; i++) {
                $(this.headerRow).append("<th class='invisible'></th>");
            }
        };

        // e.g. headerStrings = ["Name", "Units", "Min", "Max"]
        this.set_headers = function(headerStrings) {
            this.nCols = headerStrings.length;

            $(this.headerRow).children('th').each(function(index) {
                if (index < headerStrings.length)
                    $(this).text(headerStrings[index]).removeClass("invisible");
                else
                    $(this).text("").addClass("invisible");
            });
        };

        // For when something changes on the network
        this.update = function(tableData, headerStrings) {
            $(this.tbody).empty();
            for (var row in tableData) {
                // If there is only one row, make it of even class for styling
                var newRow = "<tr>";
                for (var col in tableData[row]) {
                    if (tableData[row][col]==undefined)
                        tableData[row][col] = '';
                    newRow += "<td class="+headerStrings[col]+">"+tableData[row][col]+"</td>";
                }
                $(this.tbody).append(newRow+"</tr>");
            }
            this.nRows = tableData.length;
            if (tableData[0])
                this.nCols = tableData[0].length;
            this.set_status();
            this.update_row_heights();
            $(this.table).trigger('update');
        };

        this.set_status = function() {
            var name; // Devices or signals
            if (selectedTab == all_devices) {
                name = "devices";
            }
            else name = "signals";
            this.nVisibleRows = $(this.tbody).children('tr').length - $(this.tbody).children('tr.invisible').length;
            $(this.footer).text(this.nVisibleRows+" of "+this.nRows+" "+name);

            // For styling purposes when there is only a single row
            if (this.nVisibleRows == 1)
                $(this.tbody).children('tr').addClass('even');
        };

        /* A function to make sure that rows fill up the available space, in
         * testing for now. */
        this.update_row_heights = function() {
            let height = Math.floor(tableHeight/this.nVisibleRows);
            $("#"+this.id+' tbody tr').css('height', height+'px');
        };
    }

    function update_devices(key, event) {
        if (selectedTab != all_devices)
            return;

        leftBodyContent = [];
        rightBodyContent = [];

        leftTable.set_headers(deviceHeaders);
        rightTable.set_headers(deviceHeaders);

        /* We will place the device in the left or right table depending on its
         * ratio of inputs and outputs. */

        model.devices.each(function(dev) {
            if (!dev.num_outputs && !dev.num_inputs)
                return;
            if (dev.num_outputs >= dev.num_inputs)
                leftBodyContent.push([dev.name,
                                      dev.num_inputs, dev.num_outputs,
                                      dev.host + ':' + dev.port]);
            else
                rightBodyContent.push([dev.name,
                                       dev.num_inputs, dev.num_outputs,
                                       dev.host + ':' + dev.port]);
        });

        leftTable.update(leftBodyContent, deviceHeaders);
        rightTable.update(rightBodyContent, deviceHeaders);
    }

    function update_signals(key, event) {
        if (selectedTab == all_devices)
            return;
        if (key) {
            let devname = key.split(':')[0];
            if (!focusedDevices.includes(devname))
                return;
        }

        // display all signals of selected device and linked devices

        leftBodyContent = [];
        rightBodyContent = [];

        // http://stackoverflow.com/questions/661562/how-to-format-a-float-in-javascript
        function toFixed_alt(value, precision) {
            var power = Math.pow(10, precision || 0);
            return String(Math.round(value * power) / power);
        }

        model.signals.each(function(sig) {
            if (!focusedDevices.includes(sig.device))
                return;

            let name = sig.device + '<wbr>/' + sig.name.replace(/\//g, '<wbr>/');
            let min = sig.min;
            if (typeof(min) == 'object') {
                for (i in min)
                    min[i] = toFixed_alt(min[i], 4);
            }
            else if (typeof(min) == 'number')
                min = toFixed_alt(min, 4);
            min = String(min).replace(/\,/g, '<wbr>, ');
            if (min.indexOf(',') >= 0)
                min = '[ ' + min + ' ]';

            let max = sig.max;
            if (typeof(max) == 'object') {
                for (i in max)
                    max[i] = toFixed_alt(max[i], 4);
            }
            else if (typeof(max) == 'number')
                max = toFixed_alt(max, 4);
            max = String(max).replace(/\,/g, '<wbr>, ');
            if (max.indexOf(',') >= 0)
                max = '[ ' + max + ' ]';

            if (sig.direction == 'output') {
                leftBodyContent.push([name, sig.type, sig.length, sig.unit, min,
                                      max]);
            }
            else {
                rightBodyContent.push([name, sig.type, sig.length, sig.unit, min,
                                       max]);
            }
        });

        leftTable.update(leftBodyContent, signalHeaders);
        rightTable.update(rightBodyContent, signalHeaders);

        update_maps();
    }

    function update_tabs() {
        var t = tabDevices;
        var devs = [];
        model.links.each(function(link) {
            if (!(devs.includes(link.src)))
                devs.push(link.src);
            if (!(devs.includes(link.dst)))
                devs.push(link.dst);
        });
        for (var i in devs) {
            if (t.nextSibling)
                t = t.nextSibling;
            else {
                var x = document.createElement('li');
                x.onclick = function(y) {
                    return function(e) { select_tab(y);
                                         e.stopPropagation(); };
                } (x);
                t.parentNode.appendChild(x);
                t = x;
            }
            t.innerHTML = devs[i];
        }
        if (t)
            t = t.nextSibling;
        while (t) {
            var u = t.nextSibling;
            t.parentNode.removeChild(t);
            t = u;
        }
    }

    function cleanup_edge(edge) {
        if (edge.view) {
            edge.view.remove();
        }
        delete edge.view;
        edges.remove(edge);
    }

    function cleanup_edges() {
        edges.each(cleanup_edge);
    }

    function update_links(key, event) {
        if (event != 'modified')
            update_tabs();

        if (selectedTab != all_devices) {
            if (key) {
                key = key.split("<->");
                let link = model.links.find(key);
                if (link.src == selectedTab && !focusedDevices.includes(link.dst)) {
                    focusedDevices.push(link.dst);
                    update_signals;
                    update_maps();
                }
                if (link.dst == selectedTab && !focusedDevices.includes(link.src)) {
                    focusedDevices.push(link.src);
                    update_signals;
                    update_maps();
                }
            }
            return;
        }

        // remove stale links
        old_keys = [];
        edges.each(function(edge) {
            if (!model.links.find(edge) || !update_edge_endpoints(edge)) {
                old_keys.push(edge.key);
                cleanup_edge(edge);
            }
        });

        var n_visible = edges.size();

        // add views for new links
        model.links.each(function(link) {
            let edge = edges.find(link);
            if (edge) {
                if (   link.view.arrowheads[0] != (link.num_maps[0] > 0)
                    || link.view.arrowheads[1] != (link.num_maps[1] > 0)) {
                    link.view.arrowheads = [link.num_maps[0] > 0, link.num_maps[1] > 0];
                    link.view.changed = true;
                }
                return;
            }
            else if (add_edge_view(link, String(link.num_maps[0] + link.num_maps[1]),
                                   [link.num_maps[0] > 0, link.num_maps[1] > 0])) {
                edges.add(link);
                ++n_visible;
            }
        });

        update_edges();

        $('.status.middle').text(
            n_visible + " of " + model.links.size() + " links");
    }

    function update_maps(key, event) {
        if (key) {
            let map = model.maps.find(key);
            devs = key.split("->");
            devs = [devs[0].split("/")[0], devs[1].split("/")[0]];
            if (   !focusedDevices.includes(devs[0])
                || !focusedDevices.includes(devs[1]))
                return;
            if (event == 'modified') {
                $('#container').trigger("updateMapPropertiesFor", key);
                let edge = edges.find(key), map = model.maps.find(key);
                if (edge && map) {
                    edge.status = map.status;
                    edge.muted = map.muted;
                }
            }
        }

        // remove stale maps
        old_keys = [];
        edges.each(function(edge) {
            if (!model.maps.find(edge) || !update_edge_endpoints(edge)) {
                old_keys.push(edge.key);
                cleanup_edge(edge);
            }
        });

        var n_visible = edges.size();

        // add views for new maps
        model.maps.each(function(map) {
            if (edges.find(map))
                return;
            else if (add_edge_view(map, null, [1, 0])) {
                edges.add(map);
                ++n_visible;
            }
        });

        update_edges();

        var n_maps = model.maps.size();
        $('.status.middle').text(
            n_visible + " of " + n_maps + " maps");
        if (!n_maps)
            $('#saveButton').addClass('disabled');
    }

    // Filter out unmapped signals or signals that do not match the search string
    function filter_view() {
        $('.displayTable tbody tr').each(function(i, row) {
            if ((view.unmappedVisible || is_mapped(this)) && filter_match(this))
                $(this).removeClass('invisible');
            else
                $(this).addClass('invisible');
        });

        if (selectedTab == all_devices)
            update_links();
        else
            update_maps();
        $(leftTable.table).trigger('update');
        $(rightTable.table).trigger('update');

        rightTable.set_status();
        leftTable.set_status();

        rightTable.update_row_heights();
        leftTable.update_row_heights();
        update_edges();
    }

    function filter_match(row) {
        // The text in the search box
        var filterText;
        // Test to see if the row is on the left or right table
        if ($(row).parents('.tableDiv').is('#leftTable'))
            filterText = $('#leftSearch').val();
        else if ($(row).parents('.tableDiv').is('#rightTable'))
            filterText = $('#rightSearch').val();
        else
            console.log("Error, "+row+" belongs to neither table");

        var found = false;
        // Iterate over every cell of the row
        $(row).children('td').each(function(i, cell) {
            var regExp = new RegExp(filterText, 'i');
            // Is the search string found?
            if (regExp.test($(cell).text())) {
                found = true;
            }
        });

        if (found)
            return true
        else
            return false;
    }

    /* Returns whether a row has a map. */
    function is_mapped(row) {
        // What is the name of the signal/link?
        var name = $(row).children('.name').text();
        if (selectedTab == all_devices) {
            return model.links.reduce(function(result, edge) {
                return result || name == edge.src || name == edge.dst;
            });
        }
        else {
            return model.maps.reduce(function(result, edge) {
                return result || name == edge.src || name == edge.dst;
            });
        }
    }

    function adjust_edge(edge) {
        let view = edge.view;
        let invisible = (   $(edge.view.src_tr).hasClass('invisible')
                         || $(edge.view.dst_tr).hasClass('invisible'))

        let arrowhead_offset = 7;

        let S = fullOffset(view.src_tr);
        let D = fullOffset(view.dst_tr);
        let frame = fullOffset($('#svgDiv')[0]);
        let h_center = frame.width / 2;

        if ($(view.src_tr).parents('.tableDiv').attr('id') == 'leftTable')
            var x1 = view.arrowheads[1] ? arrowhead_offset : 0;
        else
            var x1 = frame.width - (view.arrowheads[1] ? arrowhead_offset : 0);
        var y1 = S.top + S.height * view.src_offset - frame.top;

        if ($(view.dst_tr).parents('.tableDiv').attr('id') == 'leftTable')
            var x2 = view.arrowheads[0] ? arrowhead_offset : 0;
        else
            var x2 = frame.width - (view.arrowheads[0] ? arrowhead_offset : 0);
        var y2 = D.top + D.height * view.dst_offset - frame.top;

        let v_center = (y1 + y2) * 0.5;
        let h_quarter = (h_center + x1) * 0.5;

        let y3 = y1 * 0.9 + v_center * 0.1;
        let y4 = y2 * 0.9 + v_center * 0.1;

        if (S.left == D.left) {
            let mult = Math.abs(y1 - y2) * 0.25 + 35;
            h_center = S.left < h_center ? mult : frame.width - mult;
        }

        if (view.arrowheads[0])
            view.attr({"arrow-end": "block-wide-long"});
        if (view.arrowheads[1])
            view.attr({"arrow-start": "block-wide-long"});

        let path = [["M", x1, y1],
                    ["C", h_center, y3, h_center, y4, x2, y2]];
        let opacity = invisible ? 0 : edge.status == "staged" ? 0.5 : 1.0;

        if (view.new) {
            let path_start, path_mid;
            if (view.arrowheads[1]) {
                path_start = [["M", x2, y2],
                              ["C", x2, y2, x2, y2, x2, y2]];
                path_mid = [["M", h_center, v_center],
                            ["C", h_center, v_center, h_quarter, y2, x2, y2]];
            }
            else {
                path_start = [["M", x1, y1],
                              ["C", x1, y1, x1, y1, x1, y1]];
                path_mid = [["M", x1, y1],
                            ["C", h_quarter, y1, h_center, v_center, h_center,
                             v_center]];
            }

            view.attr({ "path": path_start,
                        "stroke-dasharray": edge.muted ? "--" : "" });

            view.animate({"path": path_mid,
                          "opacity": opacity}, 250, "linear", function() {
                view.animate({"path": path}, 250, "elastic");
            });
            view.new = false;
        }
        else {
            // update endpoints first
            let p = view.points;
            temp = [["M", x1, y1],
                    ["C", p[0], p[1], p[2], p[3], x2, y2]];
//            view.attr({"path": temp,
            view.attr({"stroke-dasharray": edge.muted ? "--" : ""});
            view.animate({"path": temp,
                          "opacity": opacity,
                         }, 50, "linear", function() {
                view.animate({"path": path}, 450, "elastic");
                if (view.changed) {
                    view.changed = false;
                    adjust_edge(edge);
                }
            });
        }
        view.points = [h_center, y3, h_center, y4];
    }

    function update_edge_endpoints(edge) {
        let found = 0
        for (var i = 1, row; row = leftTable.table.rows[i]; i++) {
            if (row.cells[0].textContent == edge.src) {
                edge.view.src_tr = row;
                ++found;
            }
            if (row.cells[0].textContent == edge.dst) {
                edge.view.dst_tr = row;
                ++found;
            }
            if (found >= 2)
                return true;
        }
        for (var i = 1, row; row = rightTable.table.rows[i]; i++) {
            if (row.cells[0].textContent == edge.src) {
                edge.view.src_tr = row;
                ++found;
            }
            if (row.cells[0].textContent == edge.dst) {
                edge.view.dst_tr = row;
                ++found;
            }
            if (found >= 2)
                return true;
        }
        return false;
    }

    function add_edge_view(edge, label, arrowheads) {
        let src_tr = null;
        let dst_tr = null;
        let found = 0;

        for (var i = 1, row; row = leftTable.table.rows[i]; i++) {
            if (row.cells[0].textContent == edge.src) {
                src_tr = row;
                ++found;
            }
            if (row.cells[0].textContent == edge.dst) {
                dst_tr = row;
                ++found;
            }
            if (found >= 2)
                break;
        }
        if (found < 2) {
            for (var i = 1, row; row = rightTable.table.rows[i]; i++) {
                if (row.cells[0].textContent == edge.src) {
                    src_tr = row;
                    ++found;
                }
                if (row.cells[0].textContent == edge.dst) {
                    dst_tr = row;
                    ++found;
                }
                if (found >= 2)
                    break;
            }
        }
        // Are these rows being displayed?
        if (found < 2 || $(src_tr).css('display') == 'none'
            || $(dst_tr).css('display') == 'none') {
            return 0;
        }

        var view = svgArea.path();

        view.src_tr = src_tr;
        view.dst_tr = dst_tr;
        view.label = label;
        view.src_offset = 0.5;
        view.dst_offset = 0.5;
        view.arrowheads = arrowheads;
        view.new = true;

        edge['view'] = view;

        return 1;
    }

    function update_edges() {
        this.touching = function(table) {
            for (var i = 1, row; row = table.table.rows[i]; i++) {
                // find edges touching this row
                let t = [];
                let row_fo = fullOffset(row);
                edges.each(function(edge) {
                    if (edge.view.src_tr == row) {
                        let fo = fullOffset(edge.view.dst_tr);
                        t.push([edge.view, 0, fo.top, fo.left, edge.key]);
                    }
                    if (edge.view.dst_tr == row) {
                        let fo = fullOffset(edge.view.src_tr);
                        t.push([edge.view, 1, fo.top, fo.left, edge.key]);
                    }
                });
                let len = t.length;
                if (len <= 0)
                    continue;
                // sort based on vertical row position of other endpoint
                t.sort(function(a, b) {
                    if (a[3] != b[3]) {
                       // targets are in different tables
                       if (a[3] == row_fo.left)
                           return a[2] - row_fo.top;
                       else
                           return row_fo.top - b[2];
                    }
                    else if (a[3] == row_fo.left
                             && (b[2] > row_fo.top == a[2] > row_fo.top)) {
                       // both targets on same side as src and both same direction
                       return b[2] - a[2];
                    }
                    return a[2] - b[2];
                });
                for (var j = 0; j < len; j++) {
                    let offset = (j + 1) / (len + 1);
                    if (t[j][1])
                        t[j][0].dst_offset = offset;
                    else
                        t[j][0].src_offset = offset;
                }
            }
        }
        this.touching(leftTable);
        this.touching(rightTable);
        edges.each(adjust_edge);
    }

    function select_tab(tab) {
        if (selectedTab == tab.innerHTML)
            return;

        selectedTab = tab.innerHTML;
        $(".tabsel").removeClass("tabsel");
        $(tab).addClass("tabsel");

        if (tab == tabDevices) {
            $('#svgTitle').text("Links");
            leftTable.set_headers(deviceHeaders);
            rightTable.set_headers(deviceHeaders);
            $('#saveLoadDiv').addClass('disabled');
        }
        else {
            $('#svgTitle').text("Maps");
            leftTable.set_headers(signalHeaders);
            rightTable.set_headers(signalHeaders);
            $('#saveLoadDiv').removeClass('disabled');
        }

        $('#svgTop').text('hide unmapped');
        $('#leftSearch, #rightSearch').val('');

        $('#container').trigger("tab", selectedTab);
        cleanup_edges();
        if (selectedTab == all_devices) {
            edges.keygen = model.links.keygen;
            update_devices();
            update_links();
        }
        else {
            edges.keygen = model.maps.keygen;

            // update focusedDevices
            focusedDevices = [selectedTab];
            model.links.each(function(link) {
                if (link.src == selectedTab && !focusedDevices.includes(link.dst))
                    focusedDevices.push(link.dst);
                if (link.dst == selectedTab && !focusedDevices.includes(link.src))
                    focusedDevices.push(link.src);
            });
            update_signals();
            update_maps();

            // trigger update save location event
            $('#container').trigger("updateSaveLocation");
        }
    }

    function select_tr(tr) {
        if (!tr)
            return;

        var t = $(tr);
        var name = tr.firstChild.innerHTML.replace(/<wbr>/g,'');

        // Is the row on the left or right?
        var i = (t.parents('.displayTable')[0] == leftTable.table) ? 0 : (t.parents('.displayTable')[0] == rightTable.table) ? 1 : null;
        if (i==null)
            return;

        var l = null;
        if (selectLists[selectedTab])
            l = selectLists[selectedTab][i];
        else
            selectLists[selectedTab] = [null, null];
        if (!l)
            l = new Assoc();

        if (t.hasClass("trsel")) {
            t.removeClass("trsel");
            l.remove(name);
        } else {
            t.addClass("trsel");
            l.add(name, tr.parentNode);
        }

        if (i == 0) // Left table
            lastSelectedTr.left = tr;
        else if (i == 1)
            lastSelectedTr.right = tr;

        selectLists[selectedTab][i] = l;
        $('#container').trigger("updateMapProperties");
    }

    // For selecting multiple rows with the 'shift' key
    function full_select_tr(tr) {
        var targetTable = $(tr).parents('.tableDiv').attr('id') == 'leftTable' ? '#leftTable' : '#rightTable';
        var trStart = targetTable == '#leftTable' ? lastSelectedTr.left : lastSelectedTr.right;
        if (!trStart) {
            return;
        }

        var index1 = $(tr).index();
        var index2 = $(trStart).index();

        var startIndex = Math.min(index1, index2);
        var endIndex = Math.max(index1, index2);

        $(''+targetTable+' tbody tr').each(function(i, e) {
            if (i > startIndex && i < endIndex
                && !$(e).hasClass('invisible') && !$(e).hasClass('trsel')){
                select_tr(e);
                $('#container').trigger("updateMapProperties");
            }
        });
    }

    function deselect_all() {
        $('tr.trsel', leftTable.table).each(function(i,e) {
            selectLists[selectedTab][0].remove(e.firstChild.innerHTML.replace(/<wbr>/g, ''));
            $(this).removeClass('trsel');
        });
        $('tr.trsel', rightTable.table).each(function(i,e) {
            selectLists[selectedTab][1].remove(e.firstChild.innerHTML.replace(/<wbr>/g, ''));
            $(this).removeClass('trsel');
        });
        lastSelectedTr.left = null;
        lastSelectedTr.right = null;

        edges.each(function(edge) {
            if (edge.view.selected) {
                edge.view.animate({"stroke": "black"}, 50);
                edge.view.selected = false;
            }
        });
        $('#container').trigger("updateMapProperties");
    }

    function select_all() {
        edges.each(function(edge) {
            if (!edge.view.selected) {
                edge.view.animate({"stroke": "red"}, 50);
                edge.view.selected = true;
            }
        });
    }

    function on_table_scroll() {
        update_edges();
    }

    function on_link(e, start, end) {
        if (start && end)
            $('#container').trigger("link", [start.cells[0].textContent,
                                             end.cells[0].textContent]);
        e.stopPropagation();
    }

    function on_unlink(e) {
        edges.each(function(edge) {
            if (edge.view.selected)
                $('#container').trigger("unlink", [edge.src, edge.dst]);
        });
        e.stopPropagation();
    }

    function on_map(e, start, end, args) {
        if (model.mKey) {
            args['muted'] = true;
        }
        $('#container').trigger("map", [start.cells[0].textContent,
                                        end.cells[0].textContent, args]);
        let key = model.maps.add({'src': start.cells[0].textContent,
                                  'dst': end.cells[0].textContent,
                                  'status': 'staged'});
        update_maps();
        e.stopPropagation();
    }

    function on_unmap(e) {
        edges.each(function(edge) {
            if (edge.view.selected)
                $('#container').trigger("unmap", [edge.src, edge.dst]);
        });
        e.stopPropagation();
    }

    function add_tabs() {
        $('#container').append(
            "<ul class='topTabs'>"+
                "<li id='allDevices'>"+all_devices+"</li>"+
            "</ul>");
        tabList = $('.topTabs')[0];
        tabDevices = $('#allDevices')[0];
    }

    function add_title_bar() {
        $('#container').append(
            "<div id='titleSearchDiv'>"+
                "<h2 id='leftTitle' class='searchBar'>Sources</h2></li>"+
                "<input type='text' id='leftSearch' class='searchBar'></input></li>"+
                "<h2 id='svgTitle' class='searchBar'>Links</h2></li>"+
                "<h2 id='rightTitle' class='searchBar'>Destinations</h2></li>"+
                "<input type='text' id='rightSearch' class='searchBar'></input></li>"+
            "</div>");
        var $titleSearchDiv = $('<div id="titleSearchDiv"></div>');
    }

    function add_display_tables() {
        leftTable = new listTable('leftTable');
        rightTable = new listTable('rightTable');

        // Put the tables in the DOM
        leftTable.create_within($('#container')[0]);
        rightTable.create_within($('#container')[0]);

        leftTable.set_headers(['device', 'outputs', 'host', 'port']);
        rightTable.set_headers(['device', 'input', 'host', 'port']);

        $(leftTable.table).tablesorter({widgets: ['zebra']});
        $(rightTable.table).tablesorter({widgets: ['zebra']});

        tableHeight = $('.tableDiv').height() - $('.tableDiv thead').height();
    }

    function add_svg_area() {
        $('#container').append(
            "<div id='svgDiv' class='links'>"+
                "<div id='svgTop'>hide unmapped</div>"+
            "</div>");

        svgArea = Raphael($('#svgDiv')[0], '100%', '100%');
    }

    function add_status_bar() {
        $('#container').append(
            "<table id='statusBar'>"+
                "<tr>"+
                    "<td class='status left'></td>"+
                    "<td class='status middle'></td>"+
                    "<td class='status right'></td>"+
                "</tr>"+
            "</table>");

        leftTable.footer = $("#statusBar .left")[0];
        rightTable.footer = $("#statusBar .right")[0];
    }

    function drawing_curve(sourceRow) {
        var self = this;
        this.sourceRow = sourceRow;
        this.targetRow;
        this.muted = false;
        var allow_self_link = selectedTab == all_devices;

        this.canvasWidth = $('#svgDiv').width();

        this.clamptorow = function(row, is_dst) {
            var svgPos = fullOffset($('#svgDiv')[0]);
            var rowPos = fullOffset(row);
            var y = rowPos.top + rowPos.height/2 - svgPos.top;
            return y;
        };

        this.findrow = function (y) {
            // The upper position of the canvas (to find the absolute position)
            var svgTop = $('#svgDiv').offset().top;

            // Left edge of the target table
            var ttleft = $(this.targetTable.tbody).offset().left + 5;

            // Closest table element (probably a <td> cell)
            var td = document.elementFromPoint(ttleft, svgTop + y);
            var row = $(td).parents('tr')[0];
            var incompatible = $(row).hasClass('incompatible');
            return incompatible ? null : row;
        };

        // Our bezier curve points
        this.path = [["M"], ["C"]];

        // Are we starting from for the left or right table?
        this.sourceTable;
        this.targetTable;
        if ($(this.sourceRow).parents('.tableDiv').attr('id') == "leftTable") {
            this.sourceTable = leftTable;
            this.path[0][1] = 0; // Start the curve at left
        }
        else {
            this.sourceTable = rightTable;
            this.path[0][1] = this.canvasWidth; // Start the curve at right
        }

        // And in the middle of the starting row
        this.path[0][2] = this.clamptorow(this.sourceRow, 0);

        // The actual line
        this.line = svgArea.path();

        this.update = function(moveEvent) {
            moveEvent.offsetX = moveEvent.pageX - $('#svgDiv').offset().left;
            moveEvent.offsetY = moveEvent.pageY - $('#svgDiv').offset().top;

            var target = moveEvent.currentTarget;
            var start = [this.path[0][1], this.path[0][2]];
            var end = [this.path[1][5], this.path[1][6]];
            var c1 = null;
            if (target.tagName == "svg") {
                end = [moveEvent.offsetX, moveEvent.offsetY];
                var absdiff = Math.abs(end[0] - start[0]);

                // get targetTable
                var newTargetTable;
                if (absdiff < this.canvasWidth/2)
                    newTargetTable = this.sourceTable;
                else if (this.sourceTable == leftTable)
                    newTargetTable = rightTable;
                else
                    newTargetTable = leftTable;
                if (this.targetTable != newTargetTable) {
                    this.targetTable = newTargetTable;
                    // Fade out incompatible signals
                    if (selectedTab != all_devices)
                        fade_incompatible_signals(this.sourceRow);
                }

                // Within clamping range?
                if (absdiff < 50) {
                    // we can clamp to same side
                    var startRow = this.findrow(start[1]);
                    var clampRow = this.findrow(end[1]);
                    if (clampRow && (allow_self_link || clampRow != startRow)) {
                        if (this.sourceTable == this.targetTable)
                            end[0] = start[0];
                        else
                            end[0] = this.canvasWidth - start[0] - 2;
                        c1 = end[1];
                        end[1] = this.clamptorow(clampRow, 1);
                        this.checkTarget(clampRow);
                    }
                    else
                        this.checkTarget(null);
                }
                else if (this.canvasWidth - absdiff < 50) {
                    var clampRow = this.findrow(end[1]);
                    if (clampRow) {
                        end[0] = this.canvasWidth - start[0] - 2;
                        c1 = end[1];
                        end[1] = this.clamptorow(clampRow, 1);
                        this.checkTarget(clampRow);
                    }
                    else
                        this.checkTarget(null);
                }
                else
                    this.checkTarget(null);
            }
            // We're over a table row of the target table
            if ($(target).parents('tbody')[0] == this.targetTable.tbody) {
                var rowHeight = $(target).height();
                this.checkTarget(target);
                if (this.sourceTable == this.targetTable) {
                    end[0] = start[0];
                    if (!($(target).hasClass('incompatible')))
                        end[1] = this.clamptorow(target, 1);
                    else
                        end[1] = moveEvent.offsetY;
                }
                else {
                    end[0] = this.canvasWidth - start[0] - 2;
                    if (!($(target).hasClass('incompatible')))
                        end[1] = this.clamptorow(target, 1);
                    else
                        end[1] = moveEvent.offsetY;
                }
            }
            this.path = get_bezier_path(start, end, c1, this.canvasWidth);
            this.line.attr({"path": this.path,
                            "arrow-end": "block-wide-long"});
        };

        this.mouseup = function(mouseUpEvent) {
            if (selectedTab == all_devices)
                on_link(mouseUpEvent, this.sourceRow, this.targetRow);
            else if (this.targetRow) {
                on_map(mouseUpEvent, this.sourceRow,
                       this.targetRow, {'muted': this.muted});
            }
            $("*").off('.drawing').removeClass('incompatible');
            $(document).off('.drawing');
            self.line.remove();
        };

        // Check if we have a new target row, select it if necessary
        this.checkTarget = function(mousedOverRow) {
            if (this.targetRow == mousedOverRow
                || (this.sourceRow == this.targetRow && !allow_self_link))
                return;
            if ($(mousedOverRow).hasClass('incompatible')) {
                this.targetRow = null;
                return;
            }
            if (this.targetRow != null) {
                // deselect previous
                select_tr(this.targetRow);
            }
            this.targetRow = mousedOverRow;
            select_tr(this.targetRow);
        };
    }

    // Finds a bezier curve between two points
    function get_bezier_path(start, end, controlEnd, width) {
        // 'Move to': (x0, y0), 'Control': (C1, C2, end)
        var path = [["M", start[0], start[1]], ["C"]];

        // x-coordinate of both control points
        path[1][1] = path[1][3] = width / 2;
        // y-coordinate of first control point
        if (start[0] == end[0] && start[1] == end[1]) {
            path[1][2] = start[1] + 40;
            if (controlEnd)
                path[1][4] = controlEnd - 40;
            else
                path[1][4] = end[1] - 40;
        }
        else {
            path[1][2] = start[1];
            // y-coordinate of second control point
            if (controlEnd)
                path[1][4] = controlEnd;
            else
                path[1][4] = end[1];
        }

        // Finally, the end points
        path[1][5] = end[0];
        path[1][6] = end[1];

        return path;
    }

    function fade_incompatible_signals(row) {
        $(row).addClass('incompatible');
        edges.each(function(edge) {
            if (edge.view.src_tr == row)
                $(edge.view.dst_tr).addClass('incompatible');
            else if (edge.view.dst_tr == row)
                $(edge.view.src_tr).addClass('incompatible');
        });
    }

    function drawing_handlers() {
        // Wait for a mousedown on either table
        // Handler is attached to table, but 'this' is the table row
        $('.displayTable').on('mousedown', 'tr', function(tableClick) {

            var sourceRow = this;

            // Cursor enters the canvas
            $('#svgDiv').one('mouseenter.drawing', function() {

                var curve = new drawing_curve(sourceRow);

                // Make sure only the proper row is selected
                deselect_all();
                select_tr(curve.sourceRow);
                $('#container').trigger("updateMapProperties");

                // Moving about the canvas
                $('svg, .displayTable tbody tr').on('mousemove.drawing',
                                                    function(moveEvent) {
                    curve.update(moveEvent);
                });

                $(document).one('mouseup.drawing', function(mouseUpEvent) {
                    curve.mouseup(mouseUpEvent);
                });

                $(document).on('keydown.drawing', function(keyPressEvent) {
                    if (selectedTab != all_devices && keyPressEvent.which == 77) {
                        // Change if the user is drawing a muted map
                        if (curve.muted == true) {
                            curve.muted = false;
                            curve.line.node.classList.remove('muted');
                        }
                        else {
                            curve.muted = true;
                            curve.line.node.classList.add('muted');
                        }
                    }
                });

            });

            $(document).one('mouseup.drawing', function(mouseUpEvent) {
                $("*").off('.drawing').removeClass('incompatible');
                $(document).off('.drawing');
            });
        });
    }

    // calculate intersections
    // adapted from https://bl.ocks.org/bricof/f1f5b4d4bc02cad4dea454a3c5ff8ad7
    function is_between(a, b1, b2, fudge) {
        if ((a + fudge >= b1) && (a - fudge <= b2)) {
            return true;
        }
        if ((a + fudge >= b2) && (a - fudge <= b1)) {
            return true;
        }
        return false;
    }

    function line_line_intersect(x1, y1, x2, y2, x3, y3, x4, y4) {
        let m1 = (x1 == x2) ? 1000000 : (y1 - y2) / (x1 - x2);
        let m2 = (x3 == x4) ? 1000000 : (y3 - y4) / (x3 - x4);
        if (m1 == m2) {
            // lines are parallel - todo check if same b, overlap
            return false;
        }
        let b1 = y1 - x1 * m1;
        let b2 = y3 - x3 * m2;
        let isect_x = (b2 - b1) / (m1 - m2);
        let isect_y = isect_x * m1 + b1;
        return (   is_between(isect_x, x1, x2, 0.1)
                && is_between(isect_x, x3, x4, 0.1)
                && is_between(isect_y, y1, y2, 0.1)
                && is_between(isect_y, y3, y4, 0.1));
    }

    function edge_intersection_select(x1, y1, x2, y2) {
        let updated = false;
        edges.each(function(edge) {
            let len = edge.view.getTotalLength();
            let isect = false;
            for (var j = 0; j < 10; j++) {
                let p1 = edge.view.getPointAtLength(len * j * 0.1);
                let p2 = edge.view.getPointAtLength(len * (j + 1) * 0.1);

                if (line_line_intersect(x1, y1, x2, y2, p1.x, p1.y, p2.x, p2.y)) {
                   isect = true;
                   break;
                }
            }
            if (!isect)
                return;
            if (!edge.view.selected) {
                edge.view.selected = true;
                ++updated;
            }
            if (updated) {
                edge.view.animate({"stroke": "red"}, 50);
                $('#container').trigger("updateMapProperties");
            }
        });
    }

    function selection_handlers() {
        $('.links').on('mousedown', function(e) {
            if (e.shiftKey == false) {
                deselect_all();
            }

            // cache current mouse position
            let svgPos = fullOffset($('#svgDiv')[0]);
            let x1 = e.pageX - svgPos.left;
            let y1 = e.pageY - svgPos.top;

            // try intersection with 'X'around cursor for select on 'click'
            edge_intersection_select(x1-3, y1-3, x1+3, y1+3);
            edge_intersection_select(x1-3, y1+3, x1+3, y1-3);

            let stop = false;
            // Moving about the canvas
            $('.links').on('mousemove.drawing', function(moveEvent) {
                if (stop == true)
                    return;

                let x2 = moveEvent.pageX - svgPos.left;
                let y2 = moveEvent.pageY - svgPos.top;

                if ((Math.abs(x1 - x2) + Math.abs(y1 - y2)) < 5)
                    return;

                edge_intersection_select(x1, y1, x2, y2);

                e.stopPropagation();

                x1 = x2;
                y1 = y2;
            });
            $('.links').one('mouseup.drawing', function(mouseUpEvent) {
                stop = true;
            });
        });
    }

    this.add_handlers = function() {

        $('.displayTable tbody').on({
            mousedown: function(e) {
                if (e.shiftKey == true)    // For selecting multiple rows at once
                    full_select_tr(this);
                else
                    deselect_all();
                select_tr(this);
            },
            click: function(e) { e.stopPropagation(); }
        }, 'tr');

        // For redrawing edges upon table sort
        $('.displayTable thead').on('click', 'th', function(e) {
            e.stopPropagation();
            $(this).parents(".displayTable").one('sortEnd', function() {
                update_edges();
            });
        });

        // Various keyhandlers
        $('body').on('keydown.list', function(e) {
            if (e.which == 8 || e.which == 46) { // unmap on 'delete'
                // Prevent the browser from going back a page
                // but NOT if you're focus is an input and deleting text
                if (!$(':focus').is('input')) {
                    e.preventDefault();
                }
                if (selectedTab == all_devices)
                    on_unlink(e);
                else
                    on_unmap(e);
                deselect_all();
            }
            else if (e.which == 65 && e.metaKey == true) { // Select all 'cmd+a'
                e.preventDefault();
                select_all();
            }
            else if (e.which == 9 && e.altKey == true) {
                // Tabbing like in google chrome 'alt-tab'
                e.preventDefault();
                var n_tabs = $('.topTabs li').length;
                var currentTabIndex = $('li.tabsel').index() + 1;
                var nextTabIndex;
                if (e.shiftKey == false) { // Tabbing forwards
                    if (currentTabIndex < n_tabs)
                        nextTabIndex = currentTabIndex + 1;
                    else // If we're at the last tab, select the first one
                        nextTabIndex = 1;
                }
                else {  // Tabbing backwards
                    if (currentTabIndex == 1) // At the first tab, go to the last
                        nextTabIndex = n_tabs;
                    else
                        nextTabIndex = currentTabIndex - 1;
                }
                select_tab($(tabList).children(':nth-child('+nextTabIndex+')')[0]);
            }
            else if ((e.which == 37 || e.which == 39)
                     && e.altKey == true && e.metaKey == true) {
                // Tabbing like in google chrome 'cmd-opt-left'
                e.preventDefault();
                var n_tabs = $('.topTabs li').length;
                var currentTabIndex = $('li.tabsel').index() + 1;
                var nextTabIndex;
                if (e.which == 39) { // Tabbing forwards
                    if (currentTabIndex < n_tabs)
                        nextTabIndex = currentTabIndex + 1;
                    else // If we're at the last tab, select the first one
                        nextTabIndex = 1;
                }
                else if (e.which == 37) {  // Tabbing backwards
                    if (currentTabIndex == 1) // At the first tab, go to the last
                        nextTabIndex = n_tabs;
                    else
                        nextTabIndex = currentTabIndex - 1;
                }
                select_tab($(tabList).children(':nth-child('+nextTabIndex+')')[0]);
            }
        });

        // The all devices tab
        $('#allDevices').on('click', function(e) {
            select_tab(tabDevices);
            e.stopPropagation();
        });

        // Search function boxes
        $('#leftSearch, #rightSearch').on('keyup', function(e) {
            e.stopPropagation();
            filter_view();
        });

        $('.tableDiv').on('scroll', function(e) {
            update_edges();
        });

        $('#svgTop').on('click', function(e) {
            e.stopPropagation();
            if (view.unmappedVisible == true) {
                view.unmappedVisible = false;
                $('#svgTop').text('show unmapped');
            }
            else {
                view.unmappedVisible = true;
                $('#svgTop').text('hide unmapped');
            }
            filter_view();
        });

        drawing_handlers();
        selection_handlers();
    }
}
