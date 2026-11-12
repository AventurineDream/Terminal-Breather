import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import QtQuick
import qs.Commons
import qs.Ui
import "ZenModel.js" as Model

// Fullscreen breathing pacer, on every display at once. A circle grows as
// you breathe in, holds, and shrinks as you breathe out, with the phase
// name and a countdown digit — visual pacing so the eyes can lead the breath
// and the mind has one thing to come back to. One session is owned here
// (one timer, one endSession); the panels below are just views of it, so
// the circles stay in sync across screens.
//
// Summon with:
//   omarchy-shell shell summon luotao.zen '{}'
//   omarchy-shell shell summon luotao.zen '{"pattern": "478", "minutes": 5}'
// Patterns: "box" (4-4-4-4), "478" (4-7-8), "coherent" (5.5 / 5.5),
// plus custom patterns from ~/.config/omarchy/zen/patterns.json.
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
  readonly property string patternsPath: Quickshell.env("HOME") + "/.config/omarchy/zen/patterns.json"
  readonly property string defaultLogPath: Model.meditationLogPath(Quickshell.env("HOME"))
  property string logPath: defaultLogPath

  property bool opened: false
  property string fontFamily: Style.font.menuFamily

  property var pattern: Model.pattern("box")
  property double startedAt: 0
  property int totalSecs: 600
  property double nowMs: Date.now()
  property var stats: Model.parseStats("")
  property var resolvedPatterns: Model.resolvePatterns("")

  // A summon naming a custom pattern must resolve against the freshly read
  // config file, not the map from component load — a keybinding fired right
  // after the file is created would otherwise fall back to box. open()
  // stashes the payload and the session starts once the file read
  // completes (or fails, in which case the built-ins stand).
  property var pendingStart: null

  // Session comforts, set per-summon via payload ("bell": false, "dnd":
  // false to opt out). DND is borrowed, not owned: it engages only if it
  // was off, and whatever state the user had is restored afterwards.
  property bool bellWanted: true
  property bool dndWanted: true
  property bool dndApplied: false

  function notificationService() {
    return root.shell && typeof root.shell.serviceFor === "function"
      ? root.shell.serviceFor("omarchy.notifications") : null
  }

  function applyDnd() {
    if (!dndWanted || dndApplied) return
    var svc = notificationService()
    if (!svc || typeof svc.setDoNotDisturb !== "function") return
    if (svc.doNotDisturb === true) return
    svc.setDoNotDisturb(true)
    dndApplied = true
    Quickshell.execDetached(["omarchy-shell", "-q", "omarchy.indicators", "refresh"])
  }

  function restoreDnd() {
    if (!dndApplied) return
    dndApplied = false
    var svc = notificationService()
    if (svc && typeof svc.setDoNotDisturb === "function") svc.setDoNotDisturb(false)
    Quickshell.execDetached(["omarchy-shell", "-q", "omarchy.indicators", "refresh"])
  }

  function ring(soundFile) {
    if (!bellWanted) return
    Quickshell.execDetached(Model.bellCommand("/usr/share/sounds/freedesktop/stereo/" + soundFile))
  }

  readonly property double elapsedSecs: startedAt > 0 ? Math.max(0, (nowMs - startedAt) / 1000) : 0
  readonly property double remainingSecs: Math.max(0, totalSecs - elapsedSecs)
  readonly property var breath: Model.breathAt(pattern, elapsedSecs)

  property color foreground: Color.menu.text
  readonly property color dim: Qt.darker(foreground, 1.55)

  function open(payloadJson) {
    var payload = ({})
    try { payload = JSON.parse(payloadJson || "{}") } catch (e) { payload = ({}) }
    root.pendingStart = payload
    statsFile.reload()
    patternsFile.reload()
  }

  function startSession(payload) {
    if (payload.fontFamily) root.fontFamily = payload.fontFamily

    root.pattern = Model.pattern(payload.pattern, root.resolvedPatterns.map)
    var minutes = Number(payload.minutes)
    if (!isFinite(minutes) || minutes <= 0) minutes = 10
    root.totalSecs = Math.max(10, Math.round(minutes * 60))
    root.bellWanted = payload.bell !== false
    root.dndWanted = payload.dnd !== false
    root.logPath = payload.logPath || root.defaultLogPath

    root.nowMs = Date.now()
    root.startedAt = root.nowMs
    root.opened = true
    root.applyDnd()
    root.ring("bell.oga")
  }

  function takePendingStart() {
    var p = root.pendingStart
    root.pendingStart = null
    return p
  }

  function close() {
    root.pendingStart = null
    root.opened = false
    root.restoreDnd()
  }

  function dismiss() {
    root.pendingStart = null
    root.opened = false
    root.restoreDnd()
    if (root.shell && typeof root.shell.hide === "function")
      root.shell.hide((root.manifest && root.manifest.id) || "luotao.zen")
  }

  function toggle() {
    if (root.opened) root.endSession(false)
    else root.open("{}")
  }

  // Ending early still logs the minutes actually practiced — a streak kept
  // by a short session beats one lost to perfectionism. The same minutes
  // land in the Obsidian meditation log, one row per session.
  function endSession(completed) {
    // DND back to the user's state before the completion notification, or
    // the bell we just rang announces a notification nobody sees.
    root.restoreDnd()
    var minutes = Math.floor(root.elapsedSecs / 60)
    if (completed) minutes = Math.max(1, Math.round(root.totalSecs / 60))
    if (minutes >= 1) {
      var today = Qt.formatDateTime(new Date(), "yyyy-MM-dd")
      root.stats = Model.addMinutes(root.stats, today, minutes)
      Quickshell.execDetached(Model.persistStatsCommand(root.statsPath, root.stats))
      Quickshell.execDetached(Model.appendLogCommand(root.logPath, Model.logRow(today, root.pattern.name, minutes, completed)))
    }
    if (completed) {
      root.ring("complete.oga")
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

  FileView {
    id: patternsFile
    path: root.patternsPath
    watchChanges: true
    printErrors: false
    onLoaded: {
      root.resolvedPatterns = Model.resolvePatterns(text())
      var p = root.takePendingStart()
      if (p) root.startSession(p)
    }
    onFileChanged: reload()
    onLoadFailed: {
      root.resolvedPatterns = Model.resolvePatterns("")
      var p = root.takePendingStart()
      if (p) root.startSession(p)
    }
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

  // One panel per screen. Variants instantiates this component once for
  // each screen in Quickshell.screens (and again if a screen is plugged in
  // mid-session); each panel gets its own screen and its own circle size
  // from its own dimensions, while the breath state stays shared above.
  // Only the first screen's panel takes keyboard focus — the rest are
  // visuals — so Esc/Q always lands in exactly one place.
  Component {
    id: breathePanel
    PanelWindow {
      id: panel
      required property var modelData
      required property int index
      screen: modelData
      visible: root.opened
      anchors { top: true; bottom: true; left: true; right: true }
      color: "transparent"
      WlrLayershell.namespace: "zen-breathe"
      WlrLayershell.layer: WlrLayer.Overlay
      WlrLayershell.keyboardFocus: root.opened && index === 0 ? WlrKeyboardFocus.Exclusive : WlrKeyboardFocus.None
      exclusionMode: ExclusionMode.Ignore

      // Focus belongs to the one panel that takes keys: grab it when the
      // session opens. This replaces the old callLater in startSession,
      // which could not reach a keyCatcher inside a per-screen panel.
      onVisibleChanged: if (visible && index === 0) keyCatcher.forceActiveFocus()

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

  Variants {
    model: Quickshell.screens
    delegate: breathePanel
  }
}
