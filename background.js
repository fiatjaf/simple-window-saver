/* global browser, restoreFromLocalStorage, chrome, updateBadgeForWindow */
/*

The background page is responsible for the following:
* keeping track of the saved state, as well as what's open.
* retrieving, storing and updating this state in localStorage.
* listening for window/tab events to keep our state up to date.
* saving, opening and deleting windows actions from the popups.

FEATURE: omnibox support

*/

var DEFAULT_NAME = 'Window'

/* BASIC STATE */
// an array of the names of all saved windows
var savedWindowNames = restoreFromLocalStorage('savedWindowNames', [])

// saved windows, keyed by name
// If the savedWindow has an id, it is currently open.
// Each savedWindow can only correspond to one open window at any given time.
var savedWindows = {}

// map the ids of open windows to saved window names
// used to respond to events
var windowIdToName = {}

/* EDGE CASES */
// saved windows that aren't currently open, keyed by name
// used to match new windows to saved windows that are still closed
var closedWindows = {}

// Unfortunately, removing a tab doesn't give us a windowId
// so we need to keep track of that mapping.
var tabIdToSavedWindowId = {}

// object that stores per-window flags as to whether API indicated
// window-closing intention on tab removal
var isWindowClosing = {}

/* INIT */

// populate savedWindows from local storage
// as we go, try matching them to open windows
chrome.windows.getAll({populate: true}, function(browserWindows) {
  for (var i in savedWindowNames) {
    var name = savedWindowNames[i]
    var savedWindow = restoreFromLocalStorage(name)
    if (!savedWindow) {
      console.error('Window ' + name + ' was not found in localStorage.')
      savedWindowNames.splice(savedWindowNames.indexOf(name), 1)
      localStorage.savedWindowNames = JSON.stringify(savedWindowNames)
      continue
    }

    savedWindows[name] = savedWindow

    // by default, we assume the window is closed (id is undefined)
    delete savedWindow.id

    // now, let's check if it's one of the open windows
    for (var j in browserWindows) {
      var browserWindow = browserWindows[j]
      if (windowsAreEqual(browserWindow, savedWindow)) {
        storeWindow(browserWindow, name, savedWindow.displayName)
        markWindowAsOpen(browserWindow)
        break
      }
    }

    if (!savedWindows[name].id) {
      closedWindows[name] = savedWindows[name]
    }
  }
})

// compares a current window to a saved window
// we are optimistic here: as long as the tabs of the new window
// match those of the saved window, we consider them equal
// even if the new window has more tabs
// TODO: try disregarding query strings (might be better?)
function windowsAreEqual(browserWindow, savedWindow) {
  if (browserWindow.incognito) {
    return false
  }
  if (!browserWindow.tabs || !savedWindow.tabs) {
    return false
  }
  if (browserWindow.tabs.length < savedWindow.tabs.length) {
    return false
  }
  for (var i in savedWindow.tabs) {
    if (browserWindow.tabs[i].url !== savedWindow.tabs[i].url) {
      return false
    }
  }
  return true
}

// save a window
// returns the saved window object
function saveWindow(browserWindow, displayName) {
  displayName = displayName === '' ? DEFAULT_NAME : displayName
  // handle duplicate names
  var name = displayName
  var n = 0
  while (savedWindows[name]) {
    name = displayName + n
    n++
  }

  // add window to indexes
  savedWindowNames.push(name)
  localStorage.savedWindowNames = JSON.stringify(savedWindowNames)

  storeWindow(browserWindow, name, displayName)
  if (browserWindow.id) {
    markWindowAsOpen(browserWindow)
  }

  return browserWindow
}

// store a window object
// returns the stored window
function storeWindow(browserWindow, name, displayName) {
  browserWindow.name = name
  browserWindow.displayName = displayName

  savedWindows[name] = browserWindow
  localStorage[name] = JSON.stringify(browserWindow)

  return browserWindow
}

function markWindowAsOpen(savedWindow) {
  delete closedWindows[savedWindow.name]
  windowIdToName[savedWindow.id] = savedWindow.name
  for (var i in savedWindow.tabs) {
    tabIdToSavedWindowId[savedWindow.tabs[i].id] = savedWindow.id
  }
  updateBadgeForWindow(savedWindow.id)
}

function markWindowAsClosed(savedWindow) {
  delete windowIdToName[savedWindow.id]
  closedWindows[savedWindow.name] = savedWindow
  delete savedWindow.id
}

// restore a previously saved window
async function openWindow(name) {
  // if the window was opened from a new tab, close the new tab
  let tab = (await browser.tabs.query({active: true}))[0]
  if (tab && tab.url.split(':')[0] === 'about') {
    browser.tabs.remove(tab.id)
  }

  let savedWindow = savedWindows[name]
  let {top, left, width, height, incognito, tabs} = savedWindow

  // create the window
  let newWindow = await browser.windows.create({
    top,
    left,
    width,
    height,
    incognito
  })

  // open the tabs in it
  for (let i in tabs) {
    let {url, active, cookieStoreId, pinned} = tabs[i]
    let urlPrefix = url.split(':')[0]
    switch (urlPrefix) {
      case 'chrome':
      case 'javascript':
      case 'data':
      case 'file':
        continue
    }
    switch (url) {
      case 'about:config':
      case 'about:addons':
      case 'about:debugging':
        continue
      case 'about:newtab':
        url = ''
    }

    await browser.tabs.create({
      url,
      active,
      cookieStoreId,
      pinned,
      windowId: newWindow.id
    })
  }

  // delete default tabs from the new window
  browser.tabs.remove(newWindow.tabs.map(tab => tab.id))

  onWindowOpened(savedWindow, newWindow)
}

// mark a window as opened and pin tabs if necessary
function onWindowOpened(savedWindow, browserWindow) {
  savedWindow.id = browserWindow.id
  markWindowAsOpen(savedWindow)

  // pinned tabs
  for (var i in savedWindow.tabs) {
    if (savedWindow.tabs[i].pinned) {
      chrome.tabs.update(browserWindow.tabs[i].id, {pinned: true})
    }
  }

  // move the window to the end of the list (so it appears at the top of the popup)
  savedWindowNames.splice(savedWindowNames.indexOf(savedWindow.name), 1)
  savedWindowNames[savedWindowNames.length] = savedWindow.name
  localStorage.savedWindowNames = JSON.stringify(savedWindowNames)
}

// removed a saved window
function deleteSavedWindow(name) {
  var savedWindow = savedWindows[name]

  var id = savedWindow.id
  if (id) {
    markWindowAsClosed(savedWindow)
    updateBadgeForWindow(id)
    for (var i in savedWindow.tabs) {
      delete tabIdToSavedWindowId[savedWindow.tabs[i].id]
    }
  }

  delete closedWindows[savedWindow.name]
  delete localStorage[name]
  delete savedWindows[name]
  savedWindowNames.splice(savedWindowNames.indexOf(name), 1)
  localStorage.savedWindowNames = JSON.stringify(savedWindowNames)
}
