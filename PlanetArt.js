.pragma library

// ASCII figures for the breathing overlay. The dot is replaced; the breath
// clock is not. Each figure is a character grid: stipple for tone, one or two
// accent layers for the feature that names the body.
//
// Palette is the mossglass dark-theme set, so the figures sit on a near-black
// ground without a second color system. Mandalas are 4-, 8-, or 12-fold
// wheels and apertures — orbital hardware, not star polygons. No 5-fold and
// no 6-fold star is constructed. Rings are filled annuli, not stroked ellipses.

var RAMP = "·:+*#@"
var BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5]
]

// Light from the upper left, viewer looking down +Z. Pre-normalized.
var LX = -0.348
var LY = 0.419
var LZ = 0.838
var HX = -0.182
var HY = 0.219
var HZ = 0.959

var FIGURES = [
  { id: "sun", name: "Sun", kind: "body", hint: "granules, limb darkening, a slow boil" },
  { id: "mercury", name: "Mercury", kind: "body", hint: "cratered rock, a few bright rays" },
  { id: "venus", name: "Venus", kind: "body", hint: "pale cloud deck, a soft chevron" },
  { id: "earth", name: "Earth", kind: "body", hint: "oceans, land, a drifting cloud deck" },
  { id: "moon", name: "Moon", kind: "body", hint: "maria and highlands, a slow libration" },
  { id: "mars", name: "Mars", kind: "body", hint: "rust, a dark wedge, a polar cap" },
  { id: "jupiter", name: "Jupiter", kind: "body", hint: "belts, zones, the Great Red Spot" },
  { id: "saturn", name: "Saturn", kind: "body", hint: "pale bands, a ring shadow, the Cassini division" },
  { id: "uranus", name: "Uranus", kind: "body", hint: "a pale disk, a thin ring, a polar hood" },
  { id: "neptune", name: "Neptune", kind: "body", hint: "deep blue, a dark spot, high clouds" },
  { id: "iris", name: "Iris", kind: "mandala", hint: "eight-blade aperture, opens as you inhale" },
  { id: "orbits", name: "Orbits", kind: "mandala", hint: "three tracks, one, two, and four moons" },
  { id: "petal", name: "Petal", kind: "mandala", hint: "eight petals, an ink contour" },
  { id: "lattice", name: "Lattice", kind: "mandala", hint: "twelve spokes and four rings" }
]

var BY_ID = {}
var i
for (i = 0; i < FIGURES.length; i++) BY_ID[FIGURES[i].id] = FIGURES[i]

// Equirectangular sketch, 48 x 24. Col 0 is lon -180, row 0 is the north pole.
// '#' land, '*' ice, '.' ocean. Tuned so a hemisphere reads as Earth, not a copy
// of any chart.
var EARTH = [
  "************************************************",
  "************************************************",
  "************************************************",
  "...#####.#########*.....###.....########........",
  "...#####.##########.....####...########.........",
  "...........########......##############.........",
  "..........########.....###...##########.........",
  "..........########......###....########.........",
  "............######......###############.........",
  "...........#######.....####.###...#####.........",
  "...........#####........####.....##..##.........",
  ".............###........####.........##.........",
  "..............###.......####...........##.......",
  "...............##.........##....................",
  "...............##.........##............###.....",
  "...............##.........##............###.....",
  "..............##...........#..............#.....",
  "..............##................................",
  "..............#.................................",
  "................................................",
  "................................................",
  "************************************************",
  "************************************************",
  "************************************************"
]

var MARIA = [
  { lat: 0.18, lon: -0.85, ry: 0.42, rx: 0.55 },
  { lat: 0.58, lon: -0.28, ry: 0.24, rx: 0.28 },
  { lat: 0.48, lon: 0.32, ry: 0.16, rx: 0.18 },
  { lat: 0.12, lon: 0.52, ry: 0.14, rx: 0.20 },
  { lat: 0.28, lon: 1.02, ry: 0.10, rx: 0.12 },
  { lat: -0.08, lon: 0.78, ry: 0.12, rx: 0.16 },
  { lat: -0.32, lon: -0.25, ry: 0.16, rx: 0.22 },
  { lat: -0.40, lon: -0.70, ry: 0.12, rx: 0.14 }
]

function clamp01(v) {
  if (v < 0) return 0
  if (v > 1) return 1
  return v
}

function wrap(a) {
  var p = Math.PI * 2
  var t = a % p
  if (t < 0) t += p
  if (t > Math.PI) t -= p
  return t
}

function hash2(ix, iy, seed) {
  var n = (ix * 374761393 + iy * 668265263 + (seed | 0) * 1442695041) | 0
  n = (n ^ (n >>> 13)) * 1274126177
  n = n ^ (n >>> 16)
  return (n >>> 0) / 4294967296
}

function vnoise(x, y, seed) {
  var x0 = Math.floor(x)
  var y0 = Math.floor(y)
  var xf = x - x0
  var yf = y - y0
  var u = xf * xf * (3 - 2 * xf)
  var v = yf * yf * (3 - 2 * yf)
  var a = hash2(x0, y0, seed)
  var b = hash2(x0 + 1, y0, seed)
  var c = hash2(x0, y0 + 1, seed)
  var d = hash2(x0 + 1, y0 + 1, seed)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

function fbm(x, y, seed, oct) {
  var val = 0
  var amp = 0.55
  var freq = 1
  var sum = 0
  var k
  for (k = 0; k < oct; k++) {
    val += amp * vnoise(x * freq, y * freq, seed + k * 17)
    sum += amp
    amp *= 0.5
    freq *= 2.05
  }
  return sum > 0 ? val / sum : 0
}

function curl(x, y, seed) {
  var e = 0.22
  var dx = fbm(x, y + e, seed, 3) - fbm(x, y - e, seed, 3)
  var dy = fbm(x + e, y, seed + 3, 3) - fbm(x - e, y, seed + 3, 3)
  return fbm(x + dx * 1.7, y + dy * 1.7, seed + 11, 4)
}

function idSeed(id) {
  var s = 216613626
  var n
  for (n = 0; n < id.length; n++) s = (s * 33 + id.charCodeAt(n)) | 0
  return s
}

function toneChar(t, col, row) {
  if (t < 0.05) return " "
  var d = (BAYER[row & 3][col & 3] / 16 - 0.5) * 0.05
  var u = clamp01(t + d)
  var idx = Math.min(RAMP.length - 1, Math.floor(u * (RAMP.length - 0.001)))
  if (idx < 0) idx = 0
  return RAMP.charAt(idx)
}

function ellipse(lat, lon, clat, clon, ry, rx) {
  var dlat = lat - clat
  var dlon = wrap(lon - clon)
  return (dlat / ry) * (dlat / ry) + (dlon / rx) * (dlon / rx) <= 1
}

function hitList(lat, lon, list) {
  var n
  for (n = 0; n < list.length; n++) {
    if (ellipse(lat, lon, list[n].lat, list[n].lon, list[n].ry, list[n].rx)) return true
  }
  return false
}

function angDist(lat, lon, clat, clon) {
  var dlat = lat - clat
  var dlon = wrap(lon - clon) * Math.cos((lat + clat) * 0.5)
  return Math.sqrt(dlat * dlat + dlon * dlon)
}

function lit(nx, ny, nz) {
  var lambert = nx * LX + ny * LY + nz * LZ
  if (lambert < 0) lambert = 0
  var limb = Math.pow(nz, 0.55)
  return (0.12 + 0.88 * lambert) * (0.40 + 0.60 * limb)
}

function ink(t, col, row, layer) {
  if (t < 0) t = 0
  if (t > 1) t = 1
  return { ch: toneChar(t, col, row), layer: layer }
}

function put(grid, cols, col, row, ch, layer) {
  if (!ch || ch === " ") return
  var at = row * cols + col
  var prev = grid[at]
  if (prev && prev.layer > layer) return
  grid[at] = { ch: ch, layer: layer }
}

function blank(cols, rows) {
  var g = new Array(cols * rows)
  var n
  for (n = 0; n < g.length; n++) g[n] = null
  return g
}

function bake(grid, cols, rows, colors) {
  var count = colors.length
  var lines = []
  var L
  var r
  var c
  for (L = 0; L < count; L++) lines.push([])
  for (r = 0; r < rows; r++) {
    var buf = []
    for (L = 0; L < count; L++) buf.push("")
    for (c = 0; c < cols; c++) {
      var cell = grid[r * cols + c]
      for (L = 0; L < count; L++) {
        buf[L] += cell && cell.layer === L ? cell.ch : " "
      }
    }
    for (L = 0; L < count; L++) lines[L].push(buf[L])
  }
  var layers = []
  for (L = 0; L < count; L++) {
    layers.push({ color: colors[L], text: lines[L].join("\n") })
  }
  return layers
}

function colorsFor(id) {
  if (id === "sun") return ["#E9D29D", "#F1F4EA", "#C4A56A"]
  if (id === "mercury" || id === "moon") return ["#D9E1D7", "#F1F4EA", "#8A938C"]
  if (id === "venus" || id === "saturn") return ["#E9D29D", "#F1F4EA", "#C4B48A"]
  if (id === "earth") return ["#9BAFC1", "#C6B48A", "#F1F4EA"]
  if (id === "mars") return ["#D59A78", "#F1F4EA", "#A67A58"]
  if (id === "jupiter") return ["#E9D29D", "#C4A06A", "#D98D8A"]
  if (id === "uranus") return ["#A2DED2", "#F1F4EA", "#8BCBC1"]
  if (id === "neptune") return ["#8FB0D0", "#F1F4EA", "#6E8EAE"]
  return ["#D9E1D7", "#A9D7C9", "#E9D29D"]
}

function periodOf(id) {
  if (id === "jupiter") return 34000
  if (id === "saturn") return 42000
  if (id === "neptune") return 38000
  if (id === "earth") return 52000
  if (id === "mars") return 56000
  if (id === "venus") return 74000
  if (id === "uranus") return 64000
  if (id === "mercury") return 80000
  if (id === "sun") return 90000
  if (id === "moon") return 70000
  return 48000
}

function spinOf(id, timeMs) {
  return (timeMs / periodOf(id)) * Math.PI * 2
}

function jupZone(deg) {
  var knots = [
    [-90, 0.22], [-58, 0.20], [-44, 0.62], [-34, 0.16],
    [-26, 0.72], [-18, 0.14], [-12, 0.30], [-5, 0.92],
    [3, 0.98], [9, 0.68], [15, 0.12], [23, 0.78],
    [31, 0.18], [42, 0.64], [58, 0.28], [90, 0.22]
  ]
  if (deg <= knots[0][0]) return knots[0][1]
  var n
  for (n = 1; n < knots.length; n++) {
    if (deg <= knots[n][0]) {
      var a = knots[n - 1]
      var b = knots[n]
      var t = (deg - a[0]) / (b[0] - a[0])
      return a[1] + (b[1] - a[1]) * t
    }
  }
  return knots[knots.length - 1][1]
}

function craterField(lat, lon, seed, count, rays) {
  var shade = 0
  var bright = 0
  var n
  var k
  for (n = 0; n < count; n++) {
    var clat = (hash2(n, 1, seed) - 0.5) * 2.2
    var clon = (hash2(n, 2, seed) - 0.5) * 6.2
    var rad = 0.06 + hash2(n, 3, seed) * 0.10
    var d = angDist(lat, lon, clat, clon)
    if (d < rad * 0.62) shade -= 0.22
    else if (d < rad * 0.92) bright += 0.10
    if (rays && hash2(n, 4, seed) > 0.82 && d > rad && d < rad * 3.6) {
      var ang = Math.atan2(lat - clat, wrap(lon - clon))
      for (k = 0; k < 3; k++) {
        var ray = (hash2(n, 10 + k, seed) - 0.5) * 6
        if (Math.abs(wrap(ang - ray)) < 0.06) bright += 0.10 * (1 - d / (rad * 3.6))
      }
    }
  }
  return { shade: shade, bright: bright }
}

function mapChar(rows, lat, lon) {
  var h = rows.length
  var w = rows[0].length
  var u = (lon + Math.PI) / (Math.PI * 2)
  u = u - Math.floor(u)
  var v = 0.5 - lat / Math.PI
  if (v < 0) v = 0
  if (v > 0.999) v = 0.999
  var c = Math.floor(u * w) % w
  var r = Math.floor(v * h)
  if (r < 0) r = 0
  if (r >= h) r = h - 1
  return rows[r].charAt(c)
}

function project(id, sx, sy, spin) {
  var flat = id === "saturn" ? 0.90 : id === "jupiter" ? 0.945 : 1
  var nx = sx
  var ny = sy / flat
  var r2 = nx * nx + ny * ny
  if (r2 > 1) return null
  var nz = Math.sqrt(1 - r2)
  var lat = Math.asin(ny > 1 ? 1 : ny < -1 ? -1 : ny)
  var lon0 = Math.atan2(nx, nz)
  var shear = id === "jupiter" || id === "saturn" || id === "neptune" ? 1 + 0.16 * Math.cos(lat) : 1
  return {
    nx: nx,
    ny: ny,
    nz: nz,
    lat: lat,
    lon0: lon0,
    lon: lon0 + spin * shear,
    light: lit(nx, ny, nz),
    sx: sx,
    sy: sy,
    r2: r2
  }
}

function paintBody(id, sx, sy, col, row, spin, timeMs, seed) {
  var p = project(id, sx, sy, spin)
  if (!p) return null
  var t = p.light
  var layer = 0
  var lat = p.lat
  var lon = p.lon

  if (id === "sun") {
    var boil = timeMs / 8000
    var g = fbm(lon * 5 + boil, lat * 5 + boil * 0.4, seed, 4)
    t = Math.pow(p.nz, 0.42) * (0.48 + 0.52 * g)
    var s
    for (s = 0; s < 3; s++) {
      var slat = (hash2(s, 8, seed) - 0.5) * 1.2
      var slon = (hash2(s, 9, seed) - 0.5) * 4 + spin * 0.35
      var sd = angDist(lat, lon, slat, slon)
      var sr = 0.06 + hash2(s, 10, seed) * 0.05
      if (sd < sr) t *= 0.35
      else if (sd < sr * 1.7) t *= 0.62
    }
    if (t > 0.82) layer = 1
  } else if (id === "mercury") {
    var cr = craterField(lat, lon, seed, 16, true)
    var grain = fbm(lon * 6, lat * 6, seed, 2)
    t = p.light * (0.58 + 0.22 * grain + cr.shade + cr.bright)
    if (cr.bright > 0.12) layer = 1
  } else if (id === "venus") {
    var cloud = fbm(lon * 1.3 + timeMs / 70000, lat * 1.7, seed + 4, 3)
    t = p.light * (0.74 + 0.08 * (cloud - 0.5))
    var armLon = wrap(lon)
    var arm = Math.abs(Math.abs(lat) - Math.max(0, armLon) * 0.48)
    if (arm < 0.07 && lat > -0.08 && lat < 0.52 && armLon > -0.1 && armLon < 1.25) {
      layer = 1
      t = p.light * 0.96
    }
  } else if (id === "earth") {
    var tile = mapChar(EARTH, lat, lon)
    var ice = tile === "*" || Math.abs(lat) > 1.38
    var land = tile === "#"
    var deck = curl(lon * 0.7 + timeMs / 42000, lat * 0.55, seed)
    var spec = (p.nx - HX) * (p.nx - HX) + (p.ny - HY) * (p.ny - HY) + (p.nz - HZ) * (p.nz - HZ)
    if (deck > 0.76 && p.nz > 0.25) {
      layer = 2
      t = p.light * (0.84 + 0.14 * deck)
    } else if (ice) {
      layer = 2
      t = p.light * 0.94
    } else if (land) {
      layer = 1
      t = p.light * (0.70 + 0.12 * fbm(lon * 3, lat * 3, seed, 2))
    } else {
      layer = 0
      t = p.light * (0.40 + 0.08 * fbm(lon * 2, lat * 2, seed + 2, 2))
      if (spec < 0.006) {
        layer = 2
        t = 0.92
      }
    }
  } else if (id === "moon") {
    var lib = Math.sin(timeMs / 22000) * 0.12
    var mlon = p.lon0 + lib
    var mare = hitList(lat, mlon, MARIA)
    var craters = craterField(lat, mlon, seed, 9, false)
    var high = fbm(mlon * 4, lat * 4, seed, 2)
    t = p.light * ((mare ? 0.20 : 0.68) + 0.06 * high + craters.shade * 0.7 + craters.bright * 0.35)
    if (!mare && craters.bright > 0.08) layer = 1
    var tycho = angDist(lat, mlon, -0.72, -0.20)
    if (tycho < 0.05) {
      layer = 1
      t = p.light * 0.92
    } else if (tycho < 0.48) {
      var tang = Math.atan2(lat + 0.72, wrap(mlon + 0.20))
      var ray = Math.abs(wrap(tang - 0.4))
      var ray2 = Math.abs(wrap(tang - 2.2))
      var ray3 = Math.abs(wrap(tang + 1.2))
      if (ray < 0.045 || ray2 < 0.04 || ray3 < 0.05) {
        layer = 1
        t = Math.max(t, p.light * 0.78)
      }
    }
  } else if (id === "mars") {
    var dust = fbm(lon * 2.2, lat * 2.2, seed, 3)
    t = p.light * (0.60 + 0.14 * dust)
    if (lat > 1.18) {
      layer = 1
      t = p.light * 0.92
    } else if (lat > -0.08 && lat < 0.46 && Math.abs(wrap(lon - 1.05)) < 0.16 + 0.18 * (0.46 - lat)) {
      layer = 2
      t = p.light * 0.32
    } else if (ellipse(lat, lon, -0.70, 0.50, 0.14, 0.16)) {
      layer = 1
      t = p.light * 0.88
    }
  } else if (id === "jupiter") {
    var deg = lat * 180 / Math.PI
    var zone = clamp01(jupZone(deg) + (fbm(lon * 1.8, lat * 4, seed, 2) - 0.5) * 0.10)
    var dlat = lat + 0.38
    var dlon = wrap(lon - 0.50)
    var oval = (dlat / 0.22) * (dlat / 0.22) + (dlon / 0.46) * (dlon / 0.46)
    if (oval < 1 && p.nz > 0.28) {
      layer = 2
      t = p.light * (oval > 0.78 ? 0.46 : 0.86)
    } else if (zone < 0.36) {
      layer = 1
      t = p.light * (0.20 + 0.16 * zone)
    } else {
      layer = 0
      t = p.light * (0.58 + 0.34 * zone)
    }
  } else if (id === "saturn") {
    var sdeg = lat * 180 / Math.PI
    var band = 0.70 + 0.10 * Math.sin(sdeg * 0.11)
    t = p.light * band
    if (Math.abs(p.sy - 0.05) < 0.045 && p.r2 < 0.96) {
      layer = 2
      t = p.light * 0.28
    } else if (band < 0.66) {
      layer = 2
    }
  } else if (id === "uranus") {
    var hood = p.ny > 0.28 ? (p.ny - 0.28) * 1.15 : 0
    var faint = fbm(lon * 1.1, lat * 1.6, seed, 2)
    t = p.light * (0.66 + hood + 0.04 * (faint - 0.5))
    if (hood > 0.16) layer = 1
  } else if (id === "neptune") {
    var ndeg = lat * 180 / Math.PI
    t = p.light * (0.52 + 0.05 * Math.sin(ndeg * 0.16))
    var spot = ellipse(lat, lon, -0.24, 0.20, 0.24, 0.42)
    if (spot) {
      layer = 2
      t = p.light * 0.42
    }
    var nc = fbm(lon * 3.2, lat * 4.2, seed + 6, 3)
    if (!spot && nc > 0.86 && Math.abs(lat) < 0.7 && p.nz > 0.4) {
      layer = 1
      t = p.light * 0.72
    }
    if (ellipse(lat, lon, -0.46, 0.32, 0.04, 0.06)) {
      layer = 1
      t = p.light * 0.78
    }
  }

  return ink(t, col, row, layer)
}

function stampAt(grid, cols, rows, col, row, ch, layer) {
  if (col < 0 || row < 0 || col >= cols || row >= rows) return
  if (!ch || ch === " ") return
  grid[row * cols + col] = { ch: ch, layer: layer }
}

function ringGlyph(id, sx, sy) {
  var tilt = id === "saturn" ? 0.34 : 0.13
  var rr = Math.sqrt(sx * sx + (sy / tilt) * (sy / tilt))
  if (id === "uranus") {
    if (rr >= 1.06 && rr < 1.48) return { ch: "-", layer: 2 }
    return null
  }
  if (rr >= 1.22 && rr < 1.40) return { ch: ":", layer: 2 }
  if (rr >= 1.40 && rr < 1.72) return { ch: "=", layer: 1 }
  if (rr >= 1.86 && rr < 2.24) return { ch: "-", layer: 0 }
  if (rr >= 2.28 && rr < 2.36) return { ch: "·", layer: 2 }
  return null
}

function stampRings(grid, id, cols, rows, cx, cy, disk, aspect) {
  if (id !== "saturn" && id !== "uranus") return
  var flat = id === "saturn" ? 0.90 : 1
  var row
  var col
  for (row = 0; row < rows; row++) {
    for (col = 0; col < cols; col++) {
      var sx = (col - cx) * aspect / disk
      var sy = (cy - row) / disk
      var glyph = ringGlyph(id, sx, sy)
      if (!glyph) continue
      var onDisk = sx * sx + (sy / flat) * (sy / flat) <= 1.01
      if (id === "uranus") {
        if (onDisk) continue
      } else if (onDisk && sy > 0) {
        continue
      }
      stampAt(grid, cols, rows, col, row, glyph.ch, glyph.layer)
    }
  }
}

function prominence(sx, sy, timeMs) {
  var r = Math.sqrt(sx * sx + sy * sy)
  if (r < 1.02 || r > 1.18) return false
  var ang = Math.atan2(sy, sx)
  var k
  for (k = 0; k < 4; k++) {
    var base = -2.4 + k * 1.55 + Math.sin(timeMs / 15000 + k) * 0.12
    var delta = Math.abs(wrap(ang - base))
    if (delta > 0.30) continue
    var arch = 1.035 + 0.09 * Math.sin((delta / 0.30) * Math.PI)
    if (Math.abs(r - arch) < 0.018) return true
  }
  return false
}

function spokeGlyph(theta) {
  var d = Math.abs(theta % Math.PI)
  if (d > Math.PI / 2) d = Math.PI - d
  var deg = d * 180 / Math.PI
  if (deg < 20) return "-"
  if (deg > 70) return "|"
  var q = theta % (Math.PI * 2)
  if (q < 0) q += Math.PI * 2
  if ((q < Math.PI / 2) || (q > Math.PI && q < Math.PI * 1.5)) return "/"
  return "\\"
}

function paintMandala(id, sx, sy, col, row, spin, fullness) {
  var r = Math.sqrt(sx * sx + sy * sy)
  var theta = Math.atan2(sy, sx) + spin
  if (id === "iris") {
    var pupil = 0.07 + 0.44 * clamp01(fullness)
    if (r > 0.98 || r < pupil) return null
    if (r > 0.90) return { ch: "+", layer: 1 }
    var sector = Math.PI / 4
    var a = theta % sector
    if (a < 0) a += sector
    var edge = Math.min(a, sector - a)
    if (r > pupil + 0.08 && edge < 0.032) return null
    if (r < pupil + 0.04 || a < 0.09) return { ch: "+", layer: 2 }
    return { ch: ":", layer: 0 }
  }
  if (id === "orbits") {
    var rings = [0.28, 0.54, 0.82]
    var moons = [1, 2, 4]
    var speeds = [1.1, 0.62, 0.34]
    var k
    for (k = 0; k < rings.length; k++) {
      if (Math.abs(r - rings[k]) < 0.026) return { ch: "·", layer: 1 }
      var m
      for (m = 0; m < moons[k]; m++) {
        var ang = spin * speeds[k] + m * (Math.PI * 2 / moons[k])
        var mx = Math.cos(ang) * rings[k]
        var my = Math.sin(ang) * rings[k]
        var md = Math.sqrt((sx - mx) * (sx - mx) + (sy - my) * (sy - my))
        if (md < 0.055) return { ch: md < 0.028 ? "o" : "+", layer: 2 }
      }
    }
    if (r < 0.06) return { ch: "+", layer: 0 }
    return null
  }
  if (id === "petal") {
    var fold = Math.cos(8 * theta)
    var lobe = 0.20 + 0.68 * Math.pow(Math.max(0, fold), 0.24)
    if (r > lobe || r > 0.96) return null
    if (r < 0.08) return { ch: "+", layer: 2 }
    if (lobe - r < 0.03) return { ch: "+", layer: 1 }
    var step = Math.PI / 4
    var center = Math.round(theta / step) * step
    if (Math.abs(wrap(theta - center)) < 0.045 && r > 0.18) return { ch: ":", layer: 2 }
    return { ch: ":", layer: 0 }
  }
  var spokeStep = Math.PI * 2 / 12
  var spokeN = Math.round(theta / spokeStep)
  var spokeAngle = spokeN * spokeStep
  var delta = Math.abs(wrap(theta - spokeAngle))
  var onSpoke = delta * Math.max(r, 0.10) < 0.026 && r < 0.92 && r > 0.08
  var ringsAt = [0.22 + 0.04 * clamp01(fullness), 0.44, 0.66, 0.86]
  var onRing = false
  var q
  for (q = 0; q < ringsAt.length; q++) {
    if (Math.abs(r - ringsAt[q]) < 0.020) onRing = true
  }
  if (r > 0.96) return null
  if (onSpoke && onRing) return { ch: "o", layer: 2 }
  if (onSpoke) return { ch: spokeGlyph(spokeAngle), layer: 0 }
  if (onRing) return { ch: "·", layer: 1 }
  return null
}

function oddCount(v) {
  var n = Math.round(v)
  if (n % 2 === 0) n += 1
  if (n < 3) n = 3
  return n
}

function gridSpec(id, n, aspect) {
  var a = aspect > 0.3 && aspect < 0.85 ? aspect : 0.5
  var disk = n * 0.42
  var reach = disk * 1.12
  if (id === "saturn") {
    disk = n * 0.36
    reach = disk * 2.42
  } else if (id === "uranus") {
    disk = n * 0.34
    reach = disk * 2.05
  } else if (id === "iris" || id === "orbits" || id === "petal" || id === "lattice") {
    disk = n * 0.46
    reach = disk * 1.04
  }
  return { cols: oddCount(2 * reach / a + 1), rows: oddCount(n), disk: disk, aspect: a }
}

function paintAtmosphere(id, sx, sy) {
  if (id === "sun" || id === "mercury" || id === "moon") return false
  if (id === "iris" || id === "orbits" || id === "petal" || id === "lattice") return false
  if (id === "saturn" || id === "uranus") return false
  var r = Math.sqrt(sx * sx + sy * sy)
  if (r < 1.01 || r > 1.06) return false
  return sy > -0.05
}

function maxCells(stagePx) {
  var n = Math.floor((stagePx || 360) / 12)
  if (n % 2 === 0) n -= 1
  if (n < 21) n = 21
  if (n > 45) n = 45
  return n
}

function visualScale(fullness) {
  return 0.42 + 0.58 * clamp01(fullness == null ? 1 : fullness)
}

function frame(id, opts) {
  opts = opts || {}
  var chosen = BY_ID[id] ? id : "earth"
  var spec = BY_ID[chosen]
  var n = opts.cells || opts.maxCells || maxCells(opts.stagePx)
  if (n % 2 === 0) n -= 1
  if (n < 15) n = 15
  var aspect = opts.aspect > 0.3 && opts.aspect < 0.85 ? opts.aspect : 0.5
  var g = gridSpec(chosen, n, aspect)
  var cols = g.cols
  var rows = g.rows
  var disk = g.disk
  var timeMs = opts.timeMs || 0
  var fullness = clamp01(opts.fullness == null ? 1 : opts.fullness)
  var spin = spinOf(chosen, timeMs)
  var seed = idSeed(chosen)
  var grid = blank(cols, rows)
  var cx = (cols - 1) / 2
  var cy = (rows - 1) / 2
  var row
  var col
  for (row = 0; row < rows; row++) {
    for (col = 0; col < cols; col++) {
      var sx = (col - cx) * aspect / disk
      var sy = (cy - row) / disk
      var painted = null
      if (spec.kind === "mandala") {
        painted = paintMandala(chosen, sx, sy, col, row, spin, fullness)
      } else {
        painted = paintBody(chosen, sx, sy, col, row, spin, timeMs, seed)
        if (!painted && chosen === "sun" && prominence(sx, sy, timeMs)) {
          painted = { ch: "+", layer: 2 }
        }
        if (!painted && paintAtmosphere(chosen, sx, sy)) painted = { ch: "·", layer: 1 }
      }
      if (painted && painted.ch && painted.ch !== " ") put(grid, cols, col, row, painted.ch, painted.layer)
    }
  }
  if (chosen === "saturn" || chosen === "uranus") stampRings(grid, chosen, cols, rows, cx, cy, disk, aspect)
  return {
    id: chosen,
    name: spec.name,
    kind: spec.kind,
    cols: cols,
    rows: rows,
    disk: disk,
    aspect: aspect,
    scale: visualScale(fullness),
    layers: bake(grid, cols, rows, colorsFor(chosen))
  }
}

function emptyFrame() {
  return {
    id: "",
    name: "",
    kind: "",
    cols: 1,
    rows: 1,
    disk: 0,
    scale: 1,
    layers: [{ color: "transparent", text: " " }]
  }
}

function animation(id) {
  if (id === "random" || id === "" || id == null) {
    return { id: "random", name: "Random", kind: "choice", hint: "a different figure each session" }
  }
  return BY_ID[String(id).toLowerCase()] || null
}

function ids() {
  var out = ["random"]
  var n
  for (n = 0; n < FIGURES.length; n++) out.push(FIGURES[n].id)
  return out
}

function indexOf(id) {
  var list = ids()
  var key = String(id || "random").toLowerCase()
  var n
  for (n = 0; n < list.length; n++) if (list[n] === key) return n
  return -1
}

function cycle(id, dir) {
  var list = ids()
  var at = indexOf(id)
  if (at < 0) at = 0
  var step = dir < 0 ? -1 : 1
  return list[(at + step + list.length) % list.length]
}

function resolveAnimation(choice, seed) {
  var id = String(choice || "random").toLowerCase()
  if (id && id !== "random") {
    if (BY_ID[id]) return id
    return "earth"
  }
  var h = hash2(seed | 0, 3, 11)
  var at = Math.floor(h * FIGURES.length)
  if (at < 0) at = 0
  if (at >= FIGURES.length) at = FIGURES.length - 1
  return FIGURES[at].id
}

function composite(fig) {
  if (!fig || !fig.layers || !fig.layers.length) return ""
  var rows = fig.layers[0].text.split("\n")
  var out = []
  var r
  var c
  var L
  for (r = 0; r < rows.length; r++) {
    var line = ""
    for (c = 0; c < fig.cols; c++) {
      var ch = " "
      for (L = 0; L < fig.layers.length; L++) {
        var src = fig.layers[L].text.split("\n")
        var row = src[r] || ""
        var glyph = c < row.length ? row.charAt(c) : " "
        if (glyph !== " ") ch = glyph
      }
      line += ch
    }
    out.push(line)
  }
  return out.join("\n")
}
