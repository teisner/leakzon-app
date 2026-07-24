// Map tile source configurations for react-leaflet TileLayer
// Each source supports a "type" key: 'satellite' or 'terrain'
export const MAP_SOURCES = {
  esri: {
    label: "Esri",
    satellite: {
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      attribution: "Tiles &copy; Esri",
    },
    terrain: {
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
      attribution: "Tiles &copy; Esri",
    },
    topo: {
      url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
      attribution: "&copy; OpenTopoMap (CC-BY-SA)",
      subdomains: "abc",
    },
  },
  google: {
    label: "Google Maps",
    satellite: {
      url: "https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
      attribution: "&copy; Google",
      subdomains: "0123",
    },
    terrain: {
      url: "https://mt{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}",
      attribution: "&copy; Google",
      subdomains: "0123",
    },
    topo: {
      url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
      attribution: "&copy; OpenTopoMap (CC-BY-SA)",
      subdomains: "abc",
    },
  },
  bing: {
    label: "Bing Maps",
    satellite: {
      url: "https://ecn.t{s}.tiles.virtualearth.net/tiles/a{q}.jpeg?g=14245",
      attribution: "&copy; Bing Maps",
      subdomains: "0123",
      bing: true,
    },
    terrain: {
      url: "https://ecn.t{s}.tiles.virtualearth.net/tiles/r{q}.png?g=14245",
      attribution: "&copy; Bing Maps",
      subdomains: "0123",
      bing: true,
    },
    topo: {
      url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
      attribution: "&copy; OpenTopoMap (CC-BY-SA)",
      subdomains: "abc",
    },
  },
  openstreetmap: {
    label: "OpenStreetMap",
    satellite: {
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      attribution: "Tiles &copy; Esri",
    },
    terrain: {
      url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution: "&copy; OpenStreetMap contributors",
      subdomains: "abc",
    },
    topo: {
      url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
      attribution: "&copy; OpenTopoMap (CC-BY-SA)",
      subdomains: "abc",
    },
  },
};

export const SOURCE_KEYS = Object.keys(MAP_SOURCES);