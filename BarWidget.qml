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
  readonly property string patternsPath: Quickshell.env("HOME") + "/.config/omarchy/zen/patterns.json"
  readonly property color foreground: bar ? bar.foreground : Color.foreground
  readonly property string fontFamily: bar ? bar.fontFamily : Style.font.family
  readonly property color dim: Qt.darker(foreground, 1.55)

  property var stats: Model.parseStats("")
  readonly property string todayKey: Qt.formatDateTime(new Date(), "yyyy-MM-dd")
  readonly property string summary: Model.statsSummary(stats, todayKey)
  readonly property int streak: Model.streakDays(stats, todayKey)

  property string chosenPattern: String(setting("pattern", "box"))
  property int chosenMinutes: Number(setting("minutes", 10))

  property var resolvedPatterns: Model.resolvePatterns("")

  readonly property var patternKeys: resolvedPatterns.order
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
      minutes: minutes || chosenMinutes,
      bell: setting("bell", true) !== false,
      dnd: setting("dnd", true) !== false
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
  onOpenedChanged: if (opened) { statsFile.reload(); patternsFile.reload() }

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
    onLoaded: root.resolvedPatterns = Model.resolvePatterns(text())
    onFileChanged: reload()
    onLoadFailed: root.resolvedPatterns = Model.resolvePatterns("")
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
        var idx = -1
        if (/^[1-9]$/.test(k)) {
          var n = parseInt(k, 10) - 1
          if (n < root.patternKeys.length) idx = n
        }
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

        // The week at a glance: seven small bars, today in accent. The point
        // is the shape of the habit, not precise numbers — those live in the
        // tooltip and hero line.
        Column {
          id: weekView
          width: parent.width
          spacing: Style.space(4)

          readonly property var series: Model.weekSeries(root.stats, root.todayKey)
          readonly property int weekMax: {
            var max = 0
            for (var i = 0; i < series.length; i++) max = Math.max(max, series[i].minutes)
            return max
          }

          Text {
            text: "This week · " + Model.weekTotal(weekView.series) + " min"
            color: root.dim
            font.family: root.fontFamily
            font.pixelSize: Style.font.bodySmall
          }

          Row {
            width: parent.width
            spacing: Style.space(6)

            Repeater {
              model: weekView.series

              Column {
                required property var modelData
                readonly property real share: weekView.weekMax > 0
                  ? modelData.minutes / weekView.weekMax : 0
                spacing: Style.space(3)

                Item {
                  width: Style.space(18)
                  height: Style.space(34)

                  Rectangle {
                    anchors.bottom: parent.bottom
                    anchors.horizontalCenter: parent.horizontalCenter
                    width: Style.space(10)
                    height: Math.max(Style.space(2), Math.round(parent.height * share))
                    radius: Style.space(2)
                    color: modelData.isToday ? Color.accent : root.foreground
                    opacity: modelData.minutes > 0 ? (modelData.isToday ? 0.9 : 0.45) : 0.15
                  }
                }

                Text {
                  anchors.horizontalCenter: parent.horizontalCenter
                  text: modelData.label
                  color: modelData.isToday ? root.foreground : root.dim
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.bodySmall
                }
              }
            }
          }
        }

        Flow {
          width: parent.width
          spacing: Style.space(6)

          Repeater {
            model: root.patternKeys

            Button {
              required property string modelData
              readonly property var pat: Model.pattern(modelData, root.resolvedPatterns.map)
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
          text: "1-" + Math.min(root.patternKeys.length, 9) + " pattern · Enter begin · Esc close"
          color: root.dim
          font.family: root.fontFamily
          font.pixelSize: Style.font.bodySmall
          wrapMode: Text.WordWrap
        }
      }
    }
  }
}
