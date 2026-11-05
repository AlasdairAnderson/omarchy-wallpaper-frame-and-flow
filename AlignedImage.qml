import QtQuick
import qs.Commons
import "FrameFlowModel.js" as FrameFlowModel

// Still-image surface shared by the base wallpaper and both transition frames.
// Video surfaces remain owned by Omarchy's OWE integration.
Item {
  id: root
  clip: true

  property string path: ""
  property int version: 0
  property bool cached: false
  property size decodeSize: Qt.size(0, 0)
  property var nativeSize: undefined
  property real positionRatio: 0.5
  readonly property int status: image.status
  readonly property bool ready: image.status === Image.Ready
  readonly property bool failed: image.status === Image.Error
  readonly property bool video: Util.isVideoPath(path)
  readonly property var geometry: FrameFlowModel.coverGeometry(width, height,
    nativeSize && nativeSize.width > 0 ? nativeSize.width : image.implicitWidth,
    nativeSize && nativeSize.height > 0 ? nativeSize.height : image.implicitHeight, positionRatio)
  readonly property var decode: FrameFlowModel.decodeSize(decodeSize.width, decodeSize.height,
    nativeSize ? nativeSize.width : 0, nativeSize ? nativeSize.height : 0)

  Image {
    id: image
    source: root.path && !root.video && root.decode.width > 0
      ? Util.fileUrl(root.path) + (root.version ? "?v=" + root.version : "") : ""
    width: root.geometry.width
    height: root.geometry.height
    x: root.geometry.x
    y: root.geometry.y
    sourceSize.width: root.decode.width
    sourceSize.height: root.decode.height
    fillMode: Image.PreserveAspectFit
    asynchronous: true
    cache: root.cached
    smooth: true
    mipmap: true
  }
}
