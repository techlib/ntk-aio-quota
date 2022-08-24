const { St, GObject, GLib, Shell } = imports.gi

const Main = imports.ui.main
const PanelMenu = imports.ui.panelMenu
const MessageTray = imports.ui.messageTray

const Util = imports.misc.util
const Mainloop = imports.mainloop

const ByteArray = imports.byteArray
const ExtensionUtils = imports.misc.extensionUtils
const Me = ExtensionUtils.getCurrentExtension()

const Gettext = imports.gettext

Gettext.textdomain('ntk-aio-quota')
Gettext.bindtextdomain('ntk-aio-quota', Me.path + '/locale')

const _ = Gettext.gettext;

var quotaMonitorIndicator = null
var indicatorName = Me.metadata.name
var notified = false

const LIMIT = 80
const INTERVAL = 5
const COMMAND = `/bin/sh -c "LANG=C df ~ | tail -n1"`

var QuotaMonitor = GObject.registerClass(
  class QuotaMonitor extends PanelMenu.Button {
    _init(params) {
      super._init(params, indicatorName)

      this.actor.connect('button-press-event', this._openBaobab.bind(this))
      this.initUI()

      this.timer = Mainloop.timeout_add_seconds(INTERVAL, this.refresh.bind(this))
      this.refresh()
    }

    initUI() {
      this.box = new St.BoxLayout()

      this.icon = new St.Icon({
        icon_name: 'drive-harddisk-symbolic',
        style_class: 'system-status-icon'
      })

      this.percentage = new St.Label({
        text: '0%',
        style_class: 'item'
      })

      this.box.add(this.icon)
      this.box.add(this.percentage)

      this.actor.add_actor(this.box)
    }

    destroy() {
      if (this.timer) {
        Mainloop.source_remove(this.timer)
        this.timer = null
      }

      super.destroy()
    }

    _openBaobab() {
      var app = global.log(Shell.AppSystem.get_default().lookup_app('org.gnome.baobab.desktop'))

      if (app != null) {
        app.activate()
      } else {
        Util.spawn(['baobab', GLib.get_home_dir()])
      }
    }

    refresh() {
      let [_in, out, _err] = GLib.spawn_command_line_sync(COMMAND)
      let quota = ByteArray.toString(out).trim().split(/\s+/)

      let current = parseInt(quota[2])
      let maximum = parseInt(quota[1])
      let percent = Math.round(100 * current / maximum)

      this.percentage.set_text(`${percent}%`)

      if (percent >= LIMIT && !notified) {
        notified = true
        notify(_('Quota Alert'), _('You are almost over your disk quota! Delete some files now.'), 'drive-harddisk-symbolic')
      }

      if (percent < LIMIT && notified) {
        notified = false
      }

      if (this.timer) {
        Mainloop.source_remove(this.timer)
        this.timer = null
      }

      this.timer = Mainloop.timeout_add_seconds(INTERVAL, this.refresh.bind(this))
    }
  }
)

function notify(msg, details, icon) {
  let source = new MessageTray.Source('ntk-aio-quota', icon);
  Main.messageTray.add(source);

  let notification = new MessageTray.Notification(source, msg, details);
  notification.setTransient(false);
  source.notify(notification);
}

function init() {
}

function enable() {
  quotaMonitorIndicator = new QuotaMonitor()
  Main.panel.addToStatusArea(indicatorName, quotaMonitorIndicator)
}

function disable() {
  quotaMonitorIndicator.destroy()
  quotaMonitorIndicator = null
}

/* vim:set sw=2 ts=2 et: */
