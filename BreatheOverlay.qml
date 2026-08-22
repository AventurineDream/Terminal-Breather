import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import QtQuick
import qs.Commons
import qs.Ui
import "ZenModel.js" as Model

// Fullscreen breathing pacer. A circle grows as you breathe in, holds, and
// shrinks as you breathe out, with the phase name and a countdown digit —
// visual pacing so the eyes can lead the breath and the mind has one thing
// to come back to.
//
// Summon with:
//   omarchy-shell shell summon luotao.zen '{}'
//   omarchy-shell shell summon luotao.zen '{"pattern": "478", "minutes": 5}'
// Patterns: "box" (4-4-4-4), "478" (4-7-8), "coherent" (5.5 / 5.5).
//
// Esc ends the session early; practice up to that point still counts.
Item {
  id: root

  // Injected by the shell's panel loader — omarchyPath must stay writable,
  // or the injection TypeError aborts onLoaded before registerPanelLoader
  // and every summon silently no-ops.
  property var shell: null
  property var manifest: null
  property string omarchyPath: Quickshell.env("OMARCHY_PATH")
  readonly property string statsPath: Quickshell.env("HOME") + "/.local/state/omarchy/zen/stats.json"

  property bool opened: false
  property string fontFamily: Style.font.menuFamily

  property var pattern: Model.pattern("box")
  property double startedAt: 0
  property int totalSecs: 600
  property double nowMs: Date.now()
  property var stats: Model.parseStats("")

  readonly property double elapsedSecs: startedAt > 0 ? Math.max(0, (nowMs - startedAt) / 1000) : 0
  readonly property double remainingSecs: Math.max(0, totalSecs - elapsedSecs)
  readonly property var breath: Model.breathAt(pattern, elapsedSecs)

  property color foreground: Color.menu.text
  readonly property color dim: Qt.darker(foreground, 1.55)

  function open(payloadJson) {
    var payload = ({})
    try { payload = JSON.parse(payloadJson || "{}") } catch (e) { payload = ({}) }
    if (payload.fontFamily) root.fontFamily = payload.fontFamily

    root.pattern = Model.pattern(payload.pattern)
    var minutes = Number(payload.minutes)
    if (!isFinite(minutes) || minutes <= 0) minutes = 10
    root.totalSecs = Math.max(10, Math.round(minutes * 60))

    root.nowMs = Date.now()
    root.startedAt = root.nowMs
    root.opened = true
    statsFile.reload()
    Qt.callLater(function() { keyCatcher.forceActiveFocus() })
  }

  function close() {
    root.opened = false
  }

  function dismiss() {
    root.opened = false
    if (root.shell && typeof root.shell.hide === "function")
      root.shell.hide((root.manifest && root.manifest.id) || "luotao.zen")
  }

  function toggle() {
    if (root.opened) root.endSession(false)
    else root.open("{}")
  }

  // Ending early still logs the minutes actually practiced — a streak kept
  // by a short session beats one lost to perfectionism.
  function endSession(completed) {
    var minutes = Math.floor(root.elapsedSecs / 60)
    if (completed) minutes = Math.max(1, Math.round(root.totalSecs / 60))
    if (minutes >= 1) {
      var today = Qt.formatDateTime(new Date(), "yyyy-MM-dd")
      root.stats = Model.addMinutes(root.stats, today, minutes)
      Quickshell.execDetached(Model.persistStatsCommand(root.statsPath, root.stats))
    }
    if (completed) {
      var summary = Model.statsSummary(root.stats, Qt.formatDateTime(new Date(), "yyyy-MM-dd"))
      Quickshell.execDetached([
        root.omarchyPath + "/bin/omarchy-notification-send",
        "Session complete",
        minutes + " min of " + root.pattern.name.toLowerCase() + " — " + summary
      ])
    }
    root.startedAt = 0
    root.dismiss()
  }

  FileView {
    id: statsFile
    path: root.statsPath
    watchChanges: true
    printErrors: false
    onLoaded: root.stats = Model.parseStats(text())
    onFileChanged: reload()
    onLoadFailed: root.stats = Model.parseStats("")
  }

  Timer {
    interval: 100
    running: root.opened && root.startedAt > 0
    repeat: true
    onTriggered: {
      root.nowMs = Date.now()
      if (root.remainingSecs <= 0) root.endSession(true)
    }
  }

  PanelWindow {
    id: panel
    visible: root.opened
    anchors { top: true; bottom: true; left: true; right: true }
    color: "transparent"
    WlrLayershell.namespace: "zen-breathe"
    WlrLayershell.layer: WlrLayer.Overlay
    WlrLayershell.keyboardFocus: root.opened ? WlrKeyboardFocus.Exclusive : WlrKeyboardFocus.None
    exclusionMode: ExclusionMode.Ignore

    readonly property real circleMax: Math.min(width, height) * 0.38
    readonly property real circleMin: circleMax * 0.42
    readonly property real circleSize: circleMin + (circleMax - circleMin) * root.breath.fullness

    Rectangle {
      anchors.fill: parent
      color: Color.menu.scrim
    }

    // The desktop fully gone: a breathing pacer over readable terminals is
    // just another notification fighting for attention.
    Rectangle {
      anchors.fill: parent
      color: Color.menu.background
      opacity: 0.96
    }

    Item {
      id: keyCatcher
      anchors.fill: parent
      focus: true

      Keys.priority: Keys.BeforeItem
      Keys.onPressed: function(event) {
        if (event.key === Qt.Key_Escape || event.key === Qt.Key_Q) {
          root.endSession(false)
          event.accepted = true
        }
      }
    }

    // Fixed-size stage for the breathing circle so the labels below never
    // move as it grows and shrinks — a bobbing layout would defeat the calm.
    Column {
      anchors.centerIn: parent
      spacing: Style.space(28)

      Item {
        width: panel.circleMax
        height: panel.circleMax
        anchors.horizontalCenter: parent.horizontalCenter

        // Halo: a faint outer ring at full inhale size, the target the
        // breath is growing toward.
        Rectangle {
          anchors.centerIn: parent
          width: panel.circleMax
          height: panel.circleMax
          radius: width / 2
          color: "transparent"
          border.color: root.dim
          border.width: 1
          opacity: 0.35
        }

        Rectangle {
          anchors.centerIn: parent
          width: panel.circleSize
          height: panel.circleSize
          radius: width / 2
          color: Qt.alpha(Color.accent, 0.25)
          border.color: Color.accent
          border.width: 2

          Text {
            anchors.centerIn: parent
            text: root.breath.secsLeft
            color: root.foreground
            font.family: root.fontFamily
            font.pixelSize: Math.round(panel.circleMin * 0.32)
          }
        }
      }

      Text {
        anchors.horizontalCenter: parent.horizontalCenter
        text: root.breath.label
        color: root.foreground
        font.family: root.fontFamily
        font.pixelSize: Style.font.title
      }

      Text {
        anchors.horizontalCenter: parent.horizontalCenter
        text: root.pattern.name + " · " + Model.formatRemaining(root.remainingSecs) + " left · Esc to end"
        color: root.dim
        font.family: root.fontFamily
        font.pixelSize: Style.font.body
      }
    }
  }
}
