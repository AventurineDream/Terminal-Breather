import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui
import "ZenModel.js" as Model

// Zen bar widget: an ensō glyph that opens a small panel to pick a breathing
// pattern and session length, and start. The tooltip carries the streak —
// the habit loop lives in the corner of the eye, the practice fullscreen.
Panel {
  id: root
  moduleName: "luotao.zen"
  ipcTarget: "luotao.zen"
  manageIpc: false

  property string omarchyPath: Quickshell.env("OMARCHY_PATH")
  readonly property string statsPath: Quickshell.env("HOME") + "/.local/state/omarchy/zen/stats.json"
  readonly property color foreground: bar ? bar.foreground : Color.foreground
  readonly property string fontFamily: bar ? bar.fontFamily : Style.font.family
  readonly property color dim: Qt.darker(foreground, 1.55)

  property var stats: Model.parseStats("")
  readonly property string todayKey: Qt.formatDateTime(new Date(), "yyyy-MM-dd")
  readonly property string summary: Model.statsSummary(stats, todayKey)
  readonly property int streak: Model.streakDays(stats, todayKey)

  property string chosenPattern: String(setting("pattern", "box"))
  property int chosenMinutes: Number(setting("minutes", 10))

  readonly property var patternKeys: Model.PATTERN_ORDER
  readonly property var minuteChoices: [5, 10, 15, 20]

  function choose(patternKey, minutes) {
    chosenPattern = patternKey
    chosenMinutes = minutes
    // Written back to shell.json so the choice is the default from then on,
    // same pattern as the clock's format cycling.
    var entry = { id: root.moduleName }
    for (var key in root.settings) if (key !== "id") entry[key] = root.settings[key]
    entry.pattern = patternKey
    entry.minutes = minutes
    root.settings = entry
    if (root.bar && root.bar.shell && typeof root.bar.shell.updateEntryInline === "function")
      root.bar.shell.updateEntryInline(root.moduleName, entry)
  }

  function startSession(patternKey, minutes) {
    var payload = JSON.stringify({
      pattern: patternKey || chosenPattern,
      minutes: minutes || chosenMinutes
    })
    if (root.bar && root.bar.shell && typeof root.bar.shell.summon === "function")
      root.bar.shell.summon("luotao.zen", payload)
    else
      Quickshell.execDetached(["omarchy-shell", "shell", "summon", "luotao.zen", payload])
    root.close()
  }

  // A watch established while the file doesn't exist yet never fires, so
  // reload whenever the panel opens — the streak is fresh every time it is
  // actually looked at.
  onOpenedChanged: if (opened) statsFile.reload()

  FileView {
    id: statsFile
    path: root.statsPath
    watchChanges: true
    printErrors: false
    onLoaded: root.stats = Model.parseStats(text())
    onFileChanged: reload()
    onLoadFailed: root.stats = Model.parseStats("")
  }

  IpcHandler {
    target: root.ipcTarget

    function open(): void { root.open() }
    function close(): void { root.close() }
    function show(): void { root.open() }
    function hide(): void { root.close() }
    function toggle(): void { root.toggle() }
    function start(pattern: string, minutes: string): string {
      var m = parseInt(minutes, 10)
      root.startSession(pattern || root.chosenPattern, isFinite(m) && m > 0 ? m : root.chosenMinutes)
      return "ok"
    }
    function status(): string {
      return JSON.stringify({
        streakDays: root.streak,
        todayMinutes: Model.todayMinutes(root.stats, root.todayKey),
        defaultPattern: root.chosenPattern,
        defaultMinutes: root.chosenMinutes
      })
    }
  }

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    tooltipText: "Zen — " + root.summary

    iconComponent: Component {
      Item {
        // Ensō: an open brush circle; the gap sits at the upper right. A
        // center dot appears once a streak is alive.
        Canvas {
          anchors.centerIn: parent
          width: Style.space(13)
          height: Style.space(13)

          readonly property color stroke: root.barForeground
          readonly property bool dotted: root.streak > 0
          onStrokeChanged: requestPaint()
          onDottedChanged: requestPaint()

          onPaint: {
            var c = width / 2
            var r = c - 1.5
            if (r <= 0) return
            var ctx = getContext("2d")
            ctx.reset()
            ctx.strokeStyle = stroke
            ctx.lineWidth = 1.6
            ctx.lineCap = "round"
            ctx.beginPath()
            ctx.arc(c, c, r, -Math.PI * 0.35, Math.PI * 1.45, false)
            ctx.stroke()
            if (dotted) {
              ctx.fillStyle = stroke
              ctx.beginPath()
              ctx.arc(c, c, Math.max(1, r * 0.22), 0, Math.PI * 2, false)
              ctx.fill()
            }
          }
        }
      }
    }

    onPressed: function(b) {
      if (b === Qt.MiddleButton) root.startSession(root.chosenPattern, root.chosenMinutes)
      else root.toggle()
    }
  }

  KeyboardPanel {
    id: panel
    anchorItem: button
    owner: root
    bar: root.bar
    open: root.opened
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(300))
    contentHeight: panel.fittedContentHeight(column.implicitHeight, Style.space(420))

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent

      onCloseRequested: root.close()
      onReturnRequested: root.startSession(root.chosenPattern, root.chosenMinutes)
      onTextKey: function(text) {
        var k = String(text || "").toLowerCase()
        var idx = root.patternKeys.indexOf(k === "1" ? "box" : k === "2" ? "478" : k === "3" ? "coherent" : "")
        if (idx !== -1) root.choose(root.patternKeys[idx], root.chosenMinutes)
        else if (k === "s" || k === " ") root.startSession(root.chosenPattern, root.chosenMinutes)
      }

      Column {
        id: column
        width: parent.width
        spacing: Style.space(12)

        PanelHero {
          width: parent.width
          title: "Zen"
          meta: root.summary
          foreground: root.foreground
          fontFamily: root.fontFamily
        }

        Flow {
          width: parent.width
          spacing: Style.space(6)

          Repeater {
            model: root.patternKeys

            Button {
              required property string modelData
              readonly property var pat: Model.pattern(modelData)
              text: pat.name
              tooltipText: pat.hint
              bordered: true
              selected: root.chosenPattern === modelData
              foreground: root.foreground
              fontFamily: root.fontFamily
              onClicked: root.choose(modelData, root.chosenMinutes)
            }
          }
        }

        Flow {
          width: parent.width
          spacing: Style.space(6)

          Repeater {
            model: root.minuteChoices

            Button {
              required property int modelData
              text: modelData + " min"
              bordered: true
              selected: root.chosenMinutes === modelData
              foreground: root.foreground
              fontFamily: root.fontFamily
              onClicked: root.choose(root.chosenPattern, modelData)
            }
          }
        }

        Button {
          text: "Begin"
          bordered: true
          foreground: Color.accent
          fontFamily: root.fontFamily
          onClicked: root.startSession(root.chosenPattern, root.chosenMinutes)
        }

        Text {
          width: parent.width
          text: "1-3 pattern · Enter begin · Esc close"
          color: root.dim
          font.family: root.fontFamily
          font.pixelSize: Style.font.bodySmall
          wrapMode: Text.WordWrap
        }
      }
    }
  }
}
