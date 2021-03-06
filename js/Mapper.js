//++++++++++++++++++++++++++++++++++++++//
//            Mapper Class              //
//++++++++++++++++++++++++++++++++++++++//

// This class provides the functionality for creating and removing maps
// A global instance of it is instantiated at the bottom of this file, and that
// ought to be the only instance anyone should need.

class Mapper
{
    constructor() 
    {
        this.convergent = new ConvergentMapper();
        this.convergent.mapper = this;
    }

    // make a one to one map
    map(srckey, dstkey, props)
    {
        if (srckey === dstkey) return;
        if (this._mapExists(srckey, dstkey)) return;
        else
        {
            this._map([srckey], dstkey, props);
            this._stage([srckey], dstkey);
        }
    }

    converge(srckey, dstmap, method)
    {
        if (srckey === dstmap.dst.signal.key || dstmap.srcs.map(s => s.signal.key).indexOf(srckey) >= 0)
            return;
        this.convergent.converge(srckey, dstmap, method);
    }

    _map(srckeys, dstkey, props)
    {
        command.send('map', [srckeys, dstkey, props])
    }

    _stage(srckeys, dstkey)
    {
        srckeys.sort();
        let srcs = [];
        srckeys.forEach(k => srcs.push({signal: database.find_signal(k)}));
        let m = { 'srcs': srcs,
                  'dst': {signal: database.find_signal(dstkey)},
                  'key': this.mapKey(srckeys, dstkey),
                  'status': 'staged',
                  'selected': true
                };

        database.maps.add(m);
    }

    unmap(srckeys, dstkey)
    {
        srckeys.sort();
        command.send('unmap', [srckeys, dstkey]);
    }

    mapKey(srckeys, dstkey)
    {
        if (srckeys.length === 1) return srckeys[0] + '->' + dstkey;
        else return '['+String(srckeys)+']->['+dstkey+']';
    }

    // check if a map exists with the given source and destination
    _mapExists(srckey, dstkey)
    {
        let exists = false;
        database.maps.forEach(function(map)
        {
            if (exists) return;
            if (map.dst.signal.key != dstkey) return;
            for (let src of map.srcs) 
            {
                if (src.signal.key == srckey)
                {
                    exists = true;
                    return;
                }
            }
        });
        return exists;
    }

}

// This helper class handles the complexities of preparing the arguments for making a
// convergent map, as well as defining the supported methods of convergent mapping

// The global Mapper instance owns an instance of ConvergentMapper

class ConvergentMapper
{
    constructor()
    {
        // note: the global instance also gives ConvergentMapper a reference to itself
        // i.e. this.mapper in ConvergentMapper's methods refers to the global Mapper

        // define the supported methods of convergent mapping here
        this.method = {sum: 'sum', 
                       product: 'product', 
                       average: 'average', 
                       default: 'default'};
        this.icon = {sum:     {black: 'images/convergent_add_icon_black.png', white: 'images/convergent_add_icon_white.png'},
                     product: {black: 'images/convergent_mul_icon_black.png', white: 'images/convergent_mul_icon_white.png'},
                     average: {black: 'images/convergent_avg_icon_black.png', white: 'images/convergent_avg_icon_white.png'},
                     default: {black: 'images/convergent_default_icon_black.png', white: 'images/convergent_default_icon_white.png'}};
    }

    valid_method(method)
    {
        for (let i in this.method) if (method === this.method[i]) return true;
        return false;
    }

    // make a many to one map
    map(srckeys, dstkey, props)
    {
        if (!(srckeys instanceof Array)) 
        {
            console.log("error: convergent.map must be given an array of srckeys");
            return;
        }
        else if (srckeys.length == 1)
        {
            this.mapper.map(srckeys[0], dstkey, props);
            return;
        }
        else if (srckeys.length == 0)
        {
            console.log("error: convergent.map must be given a non-empty array of srckeys");
            return;
        }

        if (database.maps.find(this.mapper.mapKey(srckeys, dstkey))) return; // map exists
        let overlap = this._overlapWithExistingMaps(srckeys, dstkey, props);
        if (overlap !== null)
        {
            // unmap the existing convergent map to make way for the new one
            this.mapper.unmap(overlap.srcs, overlap.dst);
        }
    }

    converge(srckey, dstmap, method)
    {
        if (dstmap.srcs.length >= 8) {
            console.log("warning: maps are limited to 8 sources.");
            return;
        }
        if (!this.valid_method(method)) {
            console.log("error: unexpected convergent method", method);
        }
        let expr = null;
        switch (method) 
        {
            case this.method.sum:
                expr = this._sum(srckey, dstmap);
                break;
            case this.method.product:
                expr = this._product(srckey, dstmap);
                break;
            case this.method.average:
                expr = this._average(srckey, dstmap);
                break;
            case this.method.default:
            default:
        }
        if (expr !== null) this._converge(srckey, dstmap, {expression: expr});
        else this._converge(srckey, dstmap);
    }

    // (the existing expression) + (src scaled to dst range)
    _sum(srckey, dstmap)
    {
        let [src, dst, expr] = this._prep(srckey, dstmap);
        let newx;
        if (this._signals_have_bounds([src, dst]))
            newx = ConvExpr.scaled(src.min, src.max, dst.min, dst.max, 'new');
        else newx = 'new'
        return 'y='+ConvExpr.reindex(expr+'+'+newx, src, dstmap);
    }

    // (the existing expression) * (src scaled to [0,1] range)
    _product(srckey, dstmap)
    {
        let [src, dst, expr] = this._prep(srckey, dstmap);
        let newx;
        if (this._signals_have_bounds([src, dst]))
            newx = ConvExpr.zero_to_one_scaled(src.min, src.max, 'new');
        else newx = 'new'
        newx = ConvExpr.paren_wrap(newx);
        expr = ConvExpr.paren_wrap(expr);
        return 'y='+ConvExpr.reindex(expr+'*'+newx, src, dstmap);
    }

    // average of the normalized signals scaled to dst range
    _average(srckey, dstmap)
    {
        let [src, dst, expr] = this._prep(srckey, dstmap);
        let srcs = dstmap.srcs.concat([src]).sort();

        // at time of writing, the default expression assigned by libmapper is a simple
        // average of the src signals not taking their bounds into account. If any of
        // the signals in the map are missing min and max properties, default to that
        if (!this._signals_have_bounds(srcs.concat([dst]))) return null; 

        expr = 'y=(';
        let offset = 0;
        for (let i in srcs)
        {
            let src = srcs[i];
            let x = ConvExpr.vectorize('x'+i, src, dst);
            let [b, m] = ConvExpr.zero_to_one_params(src.min, src.max);
            offset += b;
            expr += m.toString()+'*'+x+'+';
        }
        expr += offset.toString() + ')';
        expr += '*' + (dst.max - dst.min).toString() + '/' + srcs.length;
        expr += '+' + dst.min.toString();
        return expr;
    }

    _converge(srckey, dstmap, props)
    {
        let srckeys = dstmap.srcs.map(src => src.signal.key);
        this.mapper.unmap(srckeys, dstmap.dst.signal.key);
        srckeys.push(srckey);
        this.mapper._stage(srckeys, dstmap.dst.signal.key);

        // at the time of writing, the python server will not successfully create the
        // following map unless there is a time delay to give the network time to unmap
        // the existing one

        setTimeout(function() {
            this.mapper._map(srckeys, dstmap.dst.signal.key, props);
        }, 500);
    }

    _prep(srckey, dstmap)
    {
        let src = database.find_signal(srckey);
        let dst = dstmap.dst.signal;
        if (!src) 
        {
            console.log('error creating convergent map, no src matching', srckey);
            return;
        }

        let expr = dstmap.expression.substring(2);
        if (dstmap.srcs.length == 1) expr = ConvExpr.replace(expr, 'x', 'x0');
        return [src, dst, expr];
    }

    _signals_have_bounds(signals)
    {
        return signals.every(sig => typeof sig.min !== 'undefined'
                                 && typeof sig.max !== 'undefined');
    }

    _overlapWithExistingMap(srckeys, dstkey, props)
    {
        let overlapmap = this._findOverlap(srckeys, dstkey);
        if (overlapmap === null) return null;
        let overlap = { srcs: [], dst: overlapmap.dst.signal.key };
        for (let src of overlapmap.srcs) overlap.srcs.push(src.signal.key);
        return overlap;
    }
    
    _findOverlap(srckeys, dstkey)
    {
        let overlapmap = null;
        database.maps.forEach(function(map) {
            if (overlapmap !== null && map.srcs.length == 1) return;
            for (let src1 of map.srcs)
            {
                for (let src2 of srckeys)
                {
                    if (map.dst.signal.key == dstkey && src1.signal.key == src2)
                    {
                        overlapmap = map;
                        break;
                    }
                    else if (dstkey == src1.signal.key && src2 == map.dst.signal.key)
                    {
                        overlapmap = map;
                        break;
                    }
                }
            }
        });
        return overlapmap;
    }
}

// helper class for composing expressions for convergent maps
class ConvExpr
{
    constructor() {}

    static scaled(xmin, xmax, ymin, ymax, x)
    {
        let [inneroffset, innerslope] = ConvExpr.zero_to_one_params(xmin, xmax);
        let outerslope = ymax - ymin;
        let outeroffset = ymin;
        let offset = inneroffset*outerslope + outeroffset;
        let slope = innerslope*outerslope;
        if (isNaN(offset) || isNaN(slope))
            console.log('NaN error');
        return ConvExpr.offset_slope(offset, slope, x);
    }

    // returns a string in the for m*x+b so that an x with domain [min, max] will be
    // scaled to a y with the range [0,1]
    static zero_to_one_scaled(min, max, x)
    {
        let [offset, slope] = ConvExpr.zero_to_one_params(min, max);
        if (isNaN(offset) || isNaN(slope)) {
            console.log('NaN error');
            return x;
        }
        return ConvExpr.offset_slope(offset, slope, x);
    }

    static zero_to_one_params(min, max)
    {
        let offset = min / (max - min);
        let slope  = 1 / (max - min);
        return [offset, slope];
    }

    static offset_slope(offset, slope, x)
    {
        return slope.toString() + '*' + x + '+' + offset.toString();
    }

    static paren_wrap(str)
    {
        return '('+str+')';
    }

    static reindex(expr, src, dstmap, srcexprname = 'new')
    {
        let srckey = src.key;
        let srcs = dstmap.srcs.map(s => s.signal.key).concat([srckey]).sort();
        let idx = srcs.indexOf(srckey);
        for (let i = 0; i < dstmap.srcs.length; ++i)
        {
            if (i < idx) continue;
            expr = ConvExpr.replace(expr, 'x'+i, 'x'+(i+1));
        }
        return ConvExpr.replace(expr, srcexprname,
                                ConvExpr.vectorize('x'+idx, src, dstmap.dst));
    }

    static replace(expr, key, newkey)
    {
        let idxs = [];
        let idx = expr.indexOf(key);
        while(idx !== -1) 
        {
            idxs.push(idx);
            idx = expr.indexOf(key,idx+1);
        }
        for (let idx of idxs)
        {
            expr = expr.substring(0,idx) + newkey + expr.substring(idx+key.length);
        }
        return expr;
    }

    static vectorize(x, src, dst) {
        console.log('vectorize', x, src, dst);
        if (src.length > dst.length) {
            console.log('lens:', src.name, src.length, dst.length);
            // truncate source vector
            if (1 == dst.length)
                x = x+'[0]';
            else
                x = x+'[0:'+(dst.length-1)+']';
        }
        else if (src.length < dst.length) {
            // pad source vector with zeros
            let diff = dst.length - src.length;
            x = '['+x+','+(new Array(diff).fill(0))+']';

//            // Alternatively, fill with repetitions of source (like SC)
//            let mult = Math.floor(dst.length - src.length);
//            let mod = dst.length % src.length;
//            switch (mod) {
//                case 0:
//                    x = '['+(Array(mult).fill(x))+']';
//                    break;
//                case 1:
//                    x = '['+(Array(mult).fill(x))+x+'[0]]';
//                    break;
//                default:
//                    x = '['+(Array(mult).fill(x))+x+'[0:'+(mod-1)+']]';
//                    break;
//            }
        }
        return x;
    }

}

var mapper = new Mapper(); // make global instance
