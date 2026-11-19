import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import QtQuick
import qs.Commons
import qs.Ui
import "ZenModel.js" as Model
import "PlanetArt.js" as Art

// Fullscreen breathing pacer, on every display at once. A circle grows as
// you breathe in, holds, and shrinks as you breathe out, with the phase
// name and a countdown digit — visual pacing so the eyes can lead the breath
// and the mind has one thing to come back to. One session is owned here
// (one timer, one endSession); the panels below are just views of it, so
// the circles stay in sync across screens.
//
// Summon with:
//   omarchy-shell shell summon aven.terminal-breather '{}'
//   omarchy-shell shell summon aven.terminal-breather '{"pattern": "478", "minutes": 5}'
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
  readonly property string shellPath: Quickshell.env("HOME") + "/.config/omarchy/shell.json"
  readonly property string defaultLogPath: Model.meditationLogPath(Quickshell.env("HOME"))
  property string logPath: defaultLogPath

  property bool opened: false
  property string fontFamily: Style.font.menuFamily

  property var pattern: Model.pattern("box")
  property string figureId: "earth"
  property double startedAt: 0
  property int totalSecs: 600
  property double nowMs: Date.now()
  property var stats: Model.parseStats("")
  property var resolvedPatterns: Model.resolvePatterns("")

  // A summon naming a custom pattern must resolve against the freshly read
  // config file, not the map from component load — a keybinding fired right
  // after the file is created would otherwise fall back to box. open()
  // stashes the payload and the session starts once the pattern file and the
  // saved bar settings have both been read (or failed to read, in which case
  // the built-ins and the defaults stand).
  property var pendingStart: null
  property bool patternsReady: false
  property bool savedReady: false

  // The luotao.zen bar entry from shell.json: the panel's saved settings.
  // A summon names only some keys; Model.sessionSettings fills the rest here.
  property var savedSettings: ({})

  // Session comforts, set per-summon via payload ("bell": false, "dnd":
  // false to opt out). DND is borrowed, not owned: it engages only if it
  // was off, and whatever state the user had is restored afterwards.
  // The shell's service objects are out of reach for a plugin that is not
  // a full bar (serviceFor and firstPartyServiceFor return null), so DND
  // goes through the notifications IPC that Omarchy's own menu uses.
  property bool bellWanted: true
  property bool dndWanted: true
  property var dnd: Model.dndInitial()

  // DND flow. Model.dndStep decides what happens; this block feeds it the events
  // ("start", "end", and the "probed" and "restored" results that come back from
  // the processes below) and runs the commands it returns.
  Process {
    id: dndProbe
    command: Model.dndQueryCommand()
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: root.dndEvent("probed", Model.dndState(text))
    }
  }

  // A restore that cannot start emits runningChanged without exited; the
  // reducer ignores the repeat report when exited has already answered.
  Process {
    id: dndRestoreProc
    command: Model.dndSetCommand(false)
    onExited: (exitCode) => root.dndEvent("restored", exitCode === 0)
    onRunningChanged: if (!running) root.dndEvent("restored", false)
  }

  // Engage runs as a tracked process, not a detached launch, so a restore
  // that follows it can wait. A detached engage could land after the restore
  // and leave DND on after the session ended.
  property bool restoreAfterEngage: false
  Process {
    id: dndEngageProc
    command: Model.dndSetCommand(true)
    onExited: {
      if (root.restoreAfterEngage) {
        root.restoreAfterEngage = false
        dndRestoreProc.running = true
      }
    }
  }

  function dndEvent(event, arg) {
    var r = Model.dndStep(root.dnd, event, root.opened, root.dndWanted, arg)
    root.dnd = r.state
    for (var i = 0; i < r.effects.length; i++) root.runDndEffect(r.effects[i])
  }

  function runDndEffect(effect) {
    if (effect === "probe") dndProbe.running = true
    else if (effect === "restore") {
      // Restore is owed but engage is still in flight: run it once engage exits.
      if (dndEngageProc.running) root.restoreAfterEngage = true
      else dndRestoreProc.running = true
    }
    else if (effect === "engage") dndEngageProc.running = true
    else if (effect === "refresh") Quickshell.execDetached(["omarchy-shell", "-q", "omarchy.indicators", "refresh"])
  }

  function applyDnd() { root.dndEvent("start") }
  function restoreDnd() { root.dndEvent("end") }

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
    root.patternsReady = false
    root.savedReady = false
    statsFile.reload()
    patternsFile.reload()
    savedFile.reload()
  }

  // Starts the pending session once both of its inputs have been read. Each
  // file's load handler calls this, so the order the reads finish in does not
  // matter.
  function tryStart() {
    if (!root.pendingStart || !root.patternsReady || !root.savedReady) return
    var p = root.pendingStart
    root.pendingStart = null
    root.startSession(p)
  }

  // A summon during a live session first logs the minutes already practiced:
  // restarting silently would discard them. The payload's keys win; missing
  // keys come from the saved settings (Model.sessionSettings).
  function startSession(payload) {
    if (root.opened && root.startedAt > 0) {
      root.nowMs = Date.now()
      root.recordSession(false)
      root.restoreDnd()
    }
    if (payload.fontFamily) root.fontFamily = payload.fontFamily
    var s = Model.sessionSettings(payload, root.savedSettings, Quickshell.env("HOME"))

    root.pattern = Model.pattern(s.pattern, root.resolvedPatterns.map)
    root.totalSecs = Math.max(10, Math.round(s.minutes * 60))
    root.bellWanted = s.bell
    root.dndWanted = s.dnd
    root.logPath = s.logPath || root.defaultLogPath

    root.nowMs = Date.now()
    root.startedAt = root.nowMs
    root.figureId = Art.resolveAnimation(s.animation, root.startedAt)
    root.opened = true
    root.applyDnd()
    root.ring("bell.oga")
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
      root.shell.hide((root.manifest && root.manifest.id) || "aven.terminal-breather")
  }

  function toggle() {
    if (root.opened) root.endSession(false)
    else root.open("{}")
  }

  // Records the session's minutes in stats and the meditation log: the minutes
  // practiced when ended early (Esc counts too: a streak kept by a short session
  // beats one lost to perfectionism), or the full length when completed. Returns
  // the minutes recorded, 0 under one minute.
  function recordSession(completed) {
    var minutes = Math.floor(root.elapsedSecs / 60)
    if (completed) minutes = Math.max(1, Math.round(root.totalSecs / 60))
    if (minutes >= 1) {
      var today = Qt.formatDateTime(new Date(), "yyyy-MM-dd")
      root.stats = Model.addMinutes(root.stats, today, minutes)
      Quickshell.execDetached(Model.persistStatsCommand(root.statsPath, root.stats))
      Quickshell.execDetached(Model.appendLogCommand(root.logPath, Model.logRow(today, root.pattern.name, minutes, completed)))
    }
    return minutes
  }

  function endSession(completed) {
    // The completion notice uses the omarchy-action app name, which the
    // notification service's Delivery.bypassesQuiet rule allows through DND.
    root.restoreDnd()
    var minutes = root.recordSession(completed)
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
      root.patternsReady = true
      root.tryStart()
    }
    onFileChanged: reload()
    onLoadFailed: {
      root.resolvedPatterns = Model.resolvePatterns("")
      root.patternsReady = true
      root.tryStart()
    }
  }

  // The saved bar settings (figure, bell, DND, log path, defaults) that a
  // summon payload falls back to. A missing or unreadable shell.json means none.
  FileView {
    id: savedFile
    path: root.shellPath
    watchChanges: true
    printErrors: false
    onLoaded: {
      root.savedSettings = Model.barEntrySettings(text())
      root.savedReady = true
      root.tryStart()
    }
    onFileChanged: reload()
    onLoadFailed: {
      root.savedSettings = ({})
      root.savedReady = true
      root.tryStart()
    }
  }

  Timer {
    interval: 50
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
      screen: modelData
      visible: root.opened
      anchors { top: true; bottom: true; left: true; right: true }
      color: "transparent"
      WlrLayershell.namespace: "zen-breathe"
      WlrLayershell.layer: WlrLayer.Overlay
      WlrLayershell.keyboardFocus: root.opened && isFirstScreen ? WlrKeyboardFocus.Exclusive : WlrKeyboardFocus.None
      exclusionMode: ExclusionMode.Ignore

      // Variants hands the delegate its screen as modelData, but no index
      // — so the focus panel is the one whose screen is first in
      // Quickshell.screens, compared by identity.
      readonly property bool isFirstScreen: modelData === Quickshell.screens[0]

      // Focus belongs to the one panel that takes keys: grab it when the
      // session opens. This replaces the old callLater in startSession,
      // which could not reach a keyCatcher inside a per-screen panel.
      onVisibleChanged: if (visible && isFirstScreen) keyCatcher.forceActiveFocus()

      readonly property real circleMax: Math.min(width, height) * 0.38
      readonly property int figureRows: Art.maxCells(circleMax)
      readonly property real figureAspect: figureMetric.implicitWidth > 0 && figureMetric.implicitHeight > 0
        ? figureMetric.implicitWidth / figureMetric.implicitHeight : 0.5
      readonly property var figure: root.opened
        ? Art.frame(root.figureId, {
            maxCells: figureRows,
            aspect: figureAspect,
            timeMs: root.elapsedSecs * 1000,
            fullness: root.breath.fullness
          })
        : Art.emptyFrame()
      readonly property real figureFontPx: {
        var adv = figureMetric.implicitWidth / 20
        var line = figureMetric.implicitHeight / 20
        if (!(adv > 0) || !(line > 0)) return 12
        var need = Math.max(figure.cols * adv, figure.rows * line)
        return Math.max(8, circleMax / Math.max(1, need))
      }
      readonly property real figureAdvance: figureMetric.implicitWidth / 20 * figureFontPx
      readonly property real figureLine: figureMetric.implicitHeight / 20 * figureFontPx

      Text {
        id: figureMetric
        visible: false
        text: "M"
        textFormat: Text.PlainText
        font.family: "JetBrainsMono Nerd Font"
        font.pixelSize: 20
        font.kerning: false
      }

      // Opaque on purpose. Menu surfaces carry an alpha; a breathing pacer
      // over a readable terminal is just another notification.
      Rectangle {
        anchors.fill: parent
        color: Qt.rgba(Color.menu.background.r, Color.menu.background.g, Color.menu.background.b, 1)
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

      // Fixed stage. The figure scales inside it; the labels stay put.
      Column {
        anchors.centerIn: parent
        spacing: Style.space(18)

        Item {
          width: panel.circleMax
          height: panel.circleMax
          anchors.horizontalCenter: parent.horizontalCenter

          Rectangle {
            anchors.centerIn: parent
            width: Math.max(1, panel.figure.disk * 2 * panel.figureLine)
            height: width
            radius: width / 2
            color: "transparent"
            border.color: root.dim
            border.width: 1
            opacity: 0.28
          }

          Item {
            anchors.centerIn: parent
            width: panel.figure.cols * panel.figureAdvance
            height: panel.figure.rows * panel.figureLine
            scale: panel.figure.scale > 0 ? panel.figure.scale : 1

            Text {
              anchors.fill: parent
              textFormat: Text.PlainText
              text: panel.figure.layers.length > 0 ? panel.figure.layers[0].text : ""
              color: panel.figure.layers.length > 0 ? panel.figure.layers[0].color : "transparent"
              font.family: "JetBrainsMono Nerd Font"
              font.pixelSize: panel.figureFontPx
              font.kerning: false
              lineHeightMode: Text.FixedHeight
              lineHeight: panel.figureLine
              wrapMode: Text.NoWrap
              horizontalAlignment: Text.AlignLeft
              verticalAlignment: Text.AlignTop
            }
            Text {
              anchors.fill: parent
              textFormat: Text.PlainText
              text: panel.figure.layers.length > 1 ? panel.figure.layers[1].text : ""
              color: panel.figure.layers.length > 1 ? panel.figure.layers[1].color : "transparent"
              font.family: "JetBrainsMono Nerd Font"
              font.pixelSize: panel.figureFontPx
              font.kerning: false
              lineHeightMode: Text.FixedHeight
              lineHeight: panel.figureLine
              wrapMode: Text.NoWrap
              horizontalAlignment: Text.AlignLeft
              verticalAlignment: Text.AlignTop
            }
            Text {
              anchors.fill: parent
              textFormat: Text.PlainText
              text: panel.figure.layers.length > 2 ? panel.figure.layers[2].text : ""
              color: panel.figure.layers.length > 2 ? panel.figure.layers[2].color : "transparent"
              font.family: "JetBrainsMono Nerd Font"
              font.pixelSize: panel.figureFontPx
              font.kerning: false
              lineHeightMode: Text.FixedHeight
              lineHeight: panel.figureLine
              wrapMode: Text.NoWrap
              horizontalAlignment: Text.AlignLeft
              verticalAlignment: Text.AlignTop
            }
          }
        }

        Text {
          anchors.horizontalCenter: parent.horizontalCenter
          textFormat: Text.PlainText
          text: root.breath.label
          color: root.foreground
          font.family: root.fontFamily
          font.pixelSize: Style.font.title
        }

        Text {
          anchors.horizontalCenter: parent.horizontalCenter
          textFormat: Text.PlainText
          text: root.breath.secsLeft
          color: root.foreground
          font.family: root.fontFamily
          font.pixelSize: Math.round(panel.circleMax * 0.14)
        }

        Text {
          anchors.horizontalCenter: parent.horizontalCenter
          textFormat: Text.PlainText
          text: (Art.animation(root.figureId) ? Art.animation(root.figureId).name : "") + " · " + root.pattern.name + " · " + Model.formatRemaining(root.remainingSecs) + " left · Esc to end"
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
