import { Vector2 } from "@babylonjs/core/Maths/math";
import { Vector3 } from "@babylonjs/core/Maths/math";
import { BoundingBox } from "@babylonjs/core";
export var ProjectionType;
(function (ProjectionType) {
    ProjectionType[ProjectionType["EPSG_3857"] = 0] = "EPSG_3857";
    ProjectionType[ProjectionType["EPSG_4326"] = 1] = "EPSG_4326";
})(ProjectionType || (ProjectionType = {}));
//import "@babylonjs/core/Materials/standardMaterial"
//import "@babylonjs/inspector";
export default class TileMath {
    constructor(tileSet) {
        this.tileSet = tileSet;
    }
    //https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames
    lon2tile(lon, zoom) { return (Math.floor((lon + 180) / 360 * Math.pow(2, zoom))); }
    lat2tile(lat, zoom) { return (Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom))); }
    //without rounding
    lon2tileExact(lon, zoom) { return (((lon + 180) / 360 * Math.pow(2, zoom))); }
    lat2tileExact(lat, zoom) { return (((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom))); }
    //https://wiki.openstreetmap.org/wiki/Zoom_levels
    //Stile = C ∙ cos(latitude) / 2^zoomlevel
    computeTileRealWidthMeters(lat, zoom) {
        if (zoom == 0) {
            console.log("ERROR: zoom not setup yet!");
            return 0;
        }
        console.log("tryign to compute tile width for lat: " + lat);
        const C = 40075016.686;
        const latRadians = lat * Math.PI / 180.0;
        return C * Math.cos(latRadians) / Math.pow(2, zoom); //seems to need abs?
    }
    computeCornerTile(pos, projection, zoom) {
        if (zoom === undefined) {
            zoom = this.tileSet.zoom;
        }
        console.log("computing corner tile for: " + pos);
        let cornerTile = this.GetTilePosition(pos, projection, zoom);
        console.log("center tile: " + cornerTile);
        cornerTile.x -= Math.floor(this.tileSet.numTiles.x / 2); //use floor to handle odd tileset sizes
        cornerTile.y += Math.floor(this.tileSet.numTiles.y / 2);
        console.log("corner tile: " + cornerTile);
        return cornerTile;
    }
    GetWorldPosition(pos, projection, zoom) {
        if (zoom === undefined) {
            zoom = this.tileSet.zoom;
        }
        const tilePos = this.GetTilePositionExact(pos, projection, zoom);
        return this.GetWorldPositionFromTile(tilePos);
    }
    GetTilePosition(pos, projection, zoom) {
        if (zoom === undefined) {
            zoom = this.tileSet.zoom;
        }
        const exact = this.GetTilePositionExact(pos, projection, zoom);
        return new Vector2(Math.floor(exact.x), Math.floor(exact.y));
    }
    GetTilePositionExact(pos, projection, zoom) {
        if (zoom === undefined) {
            zoom = this.tileSet.zoom;
        }
        if (projection == ProjectionType.EPSG_4326) {
            const x = this.lon2tileExact(pos.x, zoom);
            const y = this.lat2tileExact(pos.y, zoom);
            return new Vector2(x, y);
        }
        else if (projection == ProjectionType.EPSG_3857) {
            //see https://stackoverflow.com/questions/37523872/converting-coordinates-from-epsg-3857-to-4326
            const max = 20037508.34;
            const xAdjusted = pos.x / max;
            const yAdjusted = pos.y / max;
            const xShifted = 0.5 * xAdjusted + 0.5;
            const yShifted = 0.5 - 0.5 * yAdjusted;
            const n = Math.pow(2, zoom);
            return new Vector2(n * xShifted, n * yShifted);
        }
        else {
            console.error("unknown projection type");
            return new Vector2(0, 0);
        }
    }
    GetWorldPositionFromTile(pos) {
        const t = this.tileSet.ourTiles[0]; //just grab the first tile
        //console.log("corner tile coords: " + t.tileCoords);
        const tileDiffX = pos.x - t.tileCoords.x;
        const tileDiffY = pos.y - t.tileCoords.y;
        //console.log("tile diff: " + tileDiffX + " " + tileDiffY);
        const upperLeftCornerX = t.mesh.position.x - this.tileSet.tileWidth * 0.5;
        const upperLeftCornerY = t.mesh.position.z + this.tileSet.tileWidth * 0.5;
        //console.log("lower left corner: " + upperLeftCornerX + " " + upperLeftCornerY);
        const xFixed = upperLeftCornerX + tileDiffX * this.tileSet.tileWidth;
        const yFixed = upperLeftCornerY - tileDiffY * this.tileSet.tileWidth;
        // console.log("world position: " + xFixed +" " + yFixed);       
        return new Vector3(xFixed, 0, yFixed);
    }
    computeTileScale() {
        const tileMeters = this.computeTileRealWidthMeters(this.tileSet.centerCoords.y, this.tileSet.zoom);
        console.log("tile (real world) width in meters: " + tileMeters);
        const tileWorldMeters = this.tileSet.tileWidth; //passed in a parameter in the constructor
        console.log("tile (in game) width in meteres: " + tileWorldMeters);
        const result = tileWorldMeters / tileMeters;
        console.log("scale of tile (in game) (1.0 would be true size): " + result);
        return result;
    }
    findBestTile(position) {
        const tileHalfWidth = this.tileSet.tileWidth * 0.500001; //make bounding box just a bit bigger, in the off chance something lands right on the line
        const addMax = new Vector3(this.tileSet.tileWidth * 0.5, 0, this.tileSet.tileWidth * 0.5);
        const addMin = new Vector3(-this.tileSet.tileWidth * 0.5, 0, -this.tileSet.tileWidth * 0.5);
        let closestTileDistance = Number.POSITIVE_INFINITY;
        let closestTile = this.tileSet.ourTiles[0];
        for (const t of this.tileSet.ourTiles) {
            const tp = t.mesh.position;
            const tMax = tp.add(addMax);
            const tMin = tp.add(addMin);
            const tileBox = new BoundingBox(tMin, tMax);
            //console.log("box: " + tileBox.center + " " + tileBox.centerWorld);   
            if (tileBox.intersectsPoint(position)) {
                //console.log("found a tile that can contain this building!");
                return t;
            }
            const dist = Vector3.Distance(tp, position);
            if (dist < closestTileDistance) {
                closestTile = t;
            }
        }
        console.log("couldn't find a tile for this building. choosing closest tile");
        return closestTile; //position wasn't inside tile, so we will send back the closest tile
    }
}
//# sourceMappingURL=TileMath.js.map