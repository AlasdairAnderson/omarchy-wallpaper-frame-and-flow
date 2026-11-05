function positionRatio(value) {
  if (value === undefined || value === null || value === "") return 0.5
  var text = String(value).toLowerCase().trim()
  if (text === "left") return 0
  if (text === "center") return 0.5
  if (text === "right") return 1
  var number = parseFloat(text)
  if (!isFinite(number)) return 0.5
  if (text.indexOf("%") !== -1 || number > 1) number /= 100
  return Math.max(0, Math.min(1, number))
}

function positionFor(path, alignments) {
  var name = String(path || "").split("/").pop()
  var map = alignments || {}
  return positionRatio(map[path] !== undefined ? map[path] : map[name])
}

function slideshowConfig(raw) {
  var config = {}
  try { config = JSON.parse(raw || "{}") || {} } catch (e) {}
  var interval = config.interval
  if (typeof interval !== "number" || !isFinite(interval) || interval <= 0) interval = 900
  return {
    enabled: config.enabled === true,
    // Keep the QML Timer's millisecond interval within its signed integer range.
    interval: Math.max(10, Math.min(86400, Math.round(interval)))
  }
}

// Cover the viewport without cropping pixels during decode, so intermediate
// horizontal positions can still pan across the complete image.
function coverGeometry(width, height, nativeWidth, nativeHeight, ratio) {
  var scale = nativeWidth > 0 && nativeHeight > 0
    ? Math.max(width / nativeWidth, height / nativeHeight) : 1
  var imageWidth = Math.ceil(nativeWidth > 0 ? nativeWidth * scale : width)
  var imageHeight = Math.ceil(nativeHeight > 0 ? nativeHeight * scale : height)
  return {
    width: imageWidth,
    height: imageHeight,
    x: Math.round(-Math.max(0, imageWidth - width) * Math.max(0, Math.min(1, ratio))),
    y: Math.round(-Math.max(0, imageHeight - height) / 2)
  }
}

function decodeSize(width, height, nativeWidth, nativeHeight) {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 }
  if (nativeWidth <= 0 || nativeHeight <= 0) return { width: width, height: height }
  var scale = Math.min(1, Math.max(width / nativeWidth, height / nativeHeight))
  return { width: Math.ceil(nativeWidth * scale), height: Math.ceil(nativeHeight * scale) }
}

if (typeof module !== "undefined") {
  module.exports = {
    positionRatio: positionRatio,
    positionFor: positionFor,
    slideshowConfig: slideshowConfig,
    coverGeometry: coverGeometry,
    decodeSize: decodeSize
  }
}
