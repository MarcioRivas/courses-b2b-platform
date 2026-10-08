/*
 * Test double for https://www.youtube.com/iframe_api, served by Playwright's
 * page.route(). Implements only what src/lib/youtube/load-iframe-api.ts types.
 *
 * - Video time runs at RATE x (10 video-seconds per real second) so specs are
 *   fast; getPlaybackRate() reports RATE so the gate's skip tolerance scales.
 * - window.__FAKE_YT_DURATION__ sets the duration (default 60).
 * - window.__FAKE_YT_ERROR__ (e.g. 150) fires onError instead of onReady.
 * - A visible "fake-play" button starts playback; a "fake-yt-time" label
 *   shows the current second.
 */
;(function () {
  var STATE = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 }
  var RATE = 10
  var STEP_MS = 50

  function Player(element, options) {
    var events = (options && options.events) || {}
    var duration = window.__FAKE_YT_DURATION__ || 60
    var time = 0
    var state = STATE.UNSTARTED
    var timer = null

    var root = document.createElement("div")
    root.setAttribute("data-testid", "fake-yt")
    root.style.cssText = "width:100%;height:100%;background:#111;color:#fff;display:flex;gap:8px;align-items:center;justify-content:center"
    var play = document.createElement("button")
    play.type = "button"
    play.textContent = "fake-play"
    play.setAttribute("aria-label", "fake-play")
    var label = document.createElement("span")
    label.setAttribute("data-testid", "fake-yt-time")
    root.appendChild(play)
    root.appendChild(label)
    element.replaceWith(root)

    function render() {
      label.textContent = String(Math.floor(time))
    }
    function stop() {
      if (timer) clearInterval(timer)
      timer = null
    }
    function emit(next) {
      state = next
      if (events.onStateChange) events.onStateChange({ data: next, target: api })
    }

    var api = {
      getCurrentTime: function () { return time },
      getDuration: function () { return duration },
      getPlayerState: function () { return state },
      getPlaybackRate: function () { return RATE },
      seekTo: function (seconds) {
        time = Math.max(0, Math.min(seconds, duration))
        render()
      },
      playVideo: function () {
        if (state === STATE.PLAYING) return
        emit(STATE.PLAYING)
        // The app may pause synchronously from onStateChange (quiz open).
        if (state !== STATE.PLAYING) return
        stop()
        timer = setInterval(function () {
          time = Math.min(duration, time + (RATE * STEP_MS) / 1000)
          render()
          if (time >= duration) {
            stop()
            emit(STATE.ENDED)
          }
        }, STEP_MS)
      },
      pauseVideo: function () {
        stop()
        if (state === STATE.PLAYING) emit(STATE.PAUSED)
      },
      destroy: function () {
        stop()
        root.remove()
      },
    }

    play.addEventListener("click", function () { api.playVideo() })
    render()

    setTimeout(function () {
      if (window.__FAKE_YT_ERROR__) {
        if (events.onError) events.onError({ data: window.__FAKE_YT_ERROR__ })
        return
      }
      if (events.onReady) events.onReady({ target: api })
    }, 0)

    return api
  }

  window.YT = { Player: Player, PlayerState: STATE }
  if (typeof window.onYouTubeIframeAPIReady === "function") window.onYouTubeIframeAPIReady()
})()
