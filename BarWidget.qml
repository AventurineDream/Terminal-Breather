import QtQuick
import QtQuick.Layouts
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui
import "ZenModel.js" as Model
import "PlanetArt.js" as Art

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
  property string chosenAnimation: String(setting("animation", "random"))

  property var resolvedPatterns: Model.resolvePatterns("")

  readonly property var patternKeys: resolvedPatterns.order
  readonly property var minuteChoices: [5, 10, 15, 20]

  // Settings section (collapsible, panel-local state).
  property bool settingsExpanded: false
  // All figure ids in manifest order: random first, then planets, then mandalas.
  readonly property var figureIds: ["random", "sun", "mercury", "venus", "earth", "moon", "mars", "jupiter", "saturn", "uranus", "neptune", "iris", "orbits", "petal", "lattice"]
  // True while the log-path field has focus; the key catcher stays blocked
  // so typing/Enter/Escape go to the editor, not to panel actions.
  readonly property bool editorActive: logPathField.activeFocus

  function settingValue(key, fallback) {
    if (root.settings && root.settings[key] !== undefined)
      return root.settings[key]
    return fallback
  }

  // Write one settings key. updateEntryInline REPLACES the whole bar
  // entry, so the full settings object is passed every time — copied
  // from the existing settings, with the key set. Copying instead of
  // rebuilding from a hardcoded key list means a key added later (or
  // set by hand) is never wiped by a panel change.
  function updateSetting(key, value) {
    var s = { id: root.moduleName }
    if (root.settings) {
      for (var k in root.settings)
        if (k !== "id") s[k] = root.settings[k]
    }
    s[key] = value
    root.settings = s
    if (key === "animation")
      chosenAnimation = String(value)
    if (root.bar && root.bar.shell && typeof root.bar.shell.updateEntryInline === "function")
      root.bar.shell.updateEntryInline(root.moduleName, s)
  }

  function choose(patternKey, minutes) {
    chosenPattern = patternKey
    chosenMinutes = minutes
    // Written back to shell.json so the choice is the default from then on,
    // same pattern as the clock's format cycling.
    var entry = { id: root.moduleName }
    for (var key in root.settings) if (key !== "id") entry[key] = root.settings[key]
    entry.pattern = patternKey
    entry.minutes = minutes
    entry.animation = chosenAnimation
    root.settings = entry
    if (root.bar && root.bar.shell && typeof root.bar.shell.updateEntryInline === "function")
      root.bar.shell.updateEntryInline(root.moduleName, entry)
  }

  function cycleAnimation(dir) {
    chosenAnimation = Art.cycle(chosenAnimation, dir)
    choose(chosenPattern, chosenMinutes)
  }

  function startSession(patternKey, minutes) {
    var payload = JSON.stringify({
      pattern: patternKey || chosenPattern,
      minutes: minutes || chosenMinutes,
      bell: setting("bell", true) !== false,
      dnd: setting("dnd", true) !== false,
      logPath: setting("meditationLogPath", "") || "",
      animation: chosenAnimation
    })
    if (root.bar && root.bar.shell && typeof root.bar.shell.summon === "function")
      root.bar.shell.summon("luotao.zen", payload)
    else
      Quickshell.execDetached(["omarchy-shell", "shell", "summon", "luotao.zen", payload])
    root.close()
  }

  // A watch established while the file doesn't exist yet never fires, so
  // reload whenever the panel opens — the streak is fresh every time it is
  // actually looked at. The log-path field is reset to the current setting
  // on open, so it never shows a stale half-typed value.
  onOpenedChanged: if (opened) { statsFile.reload(); patternsFile.reload(); logPathField.text = String(setting("meditationLogPath", "")) }

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
      blocked: root.editorActive

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
        else if (k === "a") root.cycleAnimation(1)
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

        RowLayout {
          width: parent.width
          spacing: Style.space(6)

          Button {
            text: "Prev"
            bordered: true
            foreground: root.foreground
            fontFamily: root.fontFamily
            onClicked: root.cycleAnimation(-1)
          }
          Text {
            textFormat: Text.PlainText
            text: Art.animation(root.chosenAnimation) ? Art.animation(root.chosenAnimation).name : "Random"
            color: root.foreground
            font.family: root.fontFamily
            font.pixelSize: Style.font.body
            Layout.fillWidth: true
            verticalAlignment: Text.AlignVCenter
            height: implicitHeight
          }
          Button {
            text: "Next"
            bordered: true
            foreground: root.foreground
            fontFamily: root.fontFamily
            onClicked: root.cycleAnimation(1)
          }
        }

        Text {
          width: parent.width
          textFormat: Text.PlainText
          wrapMode: Text.WordWrap
          text: Art.animation(root.chosenAnimation) ? Art.animation(root.chosenAnimation).hint : ""
          color: root.dim
          font.family: root.fontFamily
          font.pixelSize: Style.font.bodySmall
        }

        // Settings: figure picker, bell, do-not-disturb, and the
        // meditation-log path. Collapsed by default so the session
        // setup stays the focus; every change writes back to shell.json
        // via updateEntryInline, so it is the default from then on.
        Column {
          width: parent.width
          spacing: Style.space(8)

          MouseArea {
            width: parent.width
            height: settingsHeader.implicitHeight
            cursorShape: Qt.PointingHandCursor
            onClicked: root.settingsExpanded = !root.settingsExpanded

            Text {
              id: settingsHeader
              text: (root.settingsExpanded ? "v " : "> ") + "Settings"
              color: root.foreground
              font.family: root.fontFamily
              font.pixelSize: Style.font.body
            }
          }

          Column {
            width: parent.width
            spacing: Style.space(8)
            visible: root.settingsExpanded

            Text {
              text: "Figure"
              color: root.dim
              font.family: root.fontFamily
              font.pixelSize: Style.font.bodySmall
            }

            Flow {
              width: parent.width
              spacing: Style.space(6)

              Repeater {
                model: root.figureIds

                Button {
                  required property string modelData
                  text: modelData === "random" ? "Random" : (Art.animation(modelData) ? Art.animation(modelData).name : modelData)
                  tooltipText: modelData === "random" ? "Pick a random figure each session" : (Art.animation(modelData) ? Art.animation(modelData).hint : "")
                  bordered: true
                  selected: root.chosenAnimation === modelData
                  foreground: root.foreground
                  fontFamily: root.fontFamily
                  onClicked: root.updateSetting("animation", modelData)
                }
              }
            }

            Text {
              text: "Bell"
              color: root.dim
              font.family: root.fontFamily
              font.pixelSize: Style.font.bodySmall
            }

            Row {
              spacing: Style.space(6)
              Button {
                text: "On"
                bordered: true
                selected: root.settingValue("bell", true) !== false
                foreground: root.foreground
                fontFamily: root.fontFamily
                onClicked: root.updateSetting("bell", true)
              }
              Button {
                text: "Off"
                bordered: true
                selected: root.settingValue("bell", true) === false
                foreground: root.foreground
                fontFamily: root.fontFamily
                onClicked: root.updateSetting("bell", false)
              }
            }

            Text {
              text: "Do not disturb"
              color: root.dim
              font.family: root.fontFamily
              font.pixelSize: Style.font.bodySmall
            }

            Row {
              spacing: Style.space(6)
              Button {
                text: "On"
                bordered: true
                selected: root.settingValue("dnd", true) !== false
                foreground: root.foreground
                fontFamily: root.fontFamily
                onClicked: root.updateSetting("dnd", true)
              }
              Button {
                text: "Off"
                bordered: true
                selected: root.settingValue("dnd", true) === false
                foreground: root.foreground
                fontFamily: root.fontFamily
                onClicked: root.updateSetting("dnd", false)
              }
            }

            Text {
              text: "Meditation log"
              color: root.dim
              font.family: root.fontFamily
              font.pixelSize: Style.font.bodySmall
            }

            TextField {
              id: logPathField
              width: parent.width
              placeholderText: "Vault default (empty)"
              text: String(root.setting("meditationLogPath", ""))
              foreground: root.foreground
              fontFamily: root.fontFamily
              onAccepted: {
                root.updateSetting("meditationLogPath", text)
                logPathField.focus = false
              }
              Keys.onEscapePressed: logPathField.focus = false
            }

            Text {
              width: parent.width
              text: "Empty = the vault default. Enter saves."
              color: root.dim
              font.family: root.fontFamily
              font.pixelSize: Style.font.bodySmall
              wrapMode: Text.WordWrap
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
          text: "1-" + Math.min(root.patternKeys.length, 9) + " pattern · a figure · Enter begin · Esc close"
          color: root.dim
          font.family: root.fontFamily
          font.pixelSize: Style.font.bodySmall
          wrapMode: Text.WordWrap
        }
      }
    }
  }
}
