/* global chrome, tabIdToSavedWindowId, isWindowClosing, updateBadgeForTab, windowIdToName, storeWindow, savedWindows, closedWindows, windowsAreEqual, markWindowAsClosed, markWindowAsOpen */

/* TAB EVENTS */
// For most tab events, we simply resave the entire window.
// While more wasteful, this makes the code much more robust.

function onTabAttached(tabId, info) {
  onTabChanged(tabId, info.newWindowId)
  // TODO: handle the case where this was the last tab of a saved window
}
chrome.tabs.onAttached.addListener(onTabAttached)

function onTabCreated(tab) {
  onTabChanged(tab.id, tab.windowId)
}
chrome.tabs.onCreated.addListener(onTabCreated)

function onTabDetached(tabId, info) {
  if (tabIdToSavedWindowId[tabId]) {
    delete tabIdToSavedWindowId[tabId]
  }
  onTabChanged(tabId, info.oldWindowId)
}
chrome.tabs.onDetached.addListener(onTabDetached)

function onTabMoved(tabId, info) {
  onTabChanged(tabId, info.windowId)
}
chrome.tabs.onMoved.addListener(onTabMoved)

function onTabRemoved(tabId, removeInfo) {
  var windowId = tabIdToSavedWindowId[tabId]
  delete tabIdToSavedWindowId[tabId]
  isWindowClosing[windowId] = removeInfo.isWindowClosing
  onTabChanged(tabId, windowId)
}
chrome.tabs.onRemoved.addListener(onTabRemoved)

function onTabSelectionChanged(info) {
  updateBadgeForTab(info)
  onTabChanged(info.tabId, info.windowId)
}
chrome.tabs.onActivated.addListener(onTabSelectionChanged)

function onTabUpdated(tabId, info, tab) {
  onTabChanged(tabId, tab.windowId)
}
chrome.tabs.onUpdated.addListener(onTabUpdated)

// updates a window in response to a tab event
function onTabChanged(tabId, windowId) {
  if (isWindowClosing[windowId]) return
  getPopulatedWindow(windowId, function(browserWindow) {
    // if the window is saved, we update it
    if (windowIdToName[windowId]) {
      tabIdToSavedWindowId[tabId] = windowId
      var name = windowIdToName[windowId]
      var displayName = savedWindows[name].displayName
      storeWindow(browserWindow, name, displayName)
    } else {
      // otherwise we double check that it's not saved
      for (let i in closedWindows) {
        var savedWindow = closedWindows[i]
        if (windowsAreEqual(browserWindow, savedWindow)) {
          name = savedWindow.name
          displayName = savedWindow.displayName
          storeWindow(browserWindow, name, displayName)
          markWindowAsOpen(browserWindow)
        }
      }
    }
    if (tabId) {
      updateBadgeForTab({id: tabId, windowId: windowId})
    }
  })
}

// given a window id, fetches the corresponding window object
// and tabs, and calls callback with the window as argument
function getPopulatedWindow(windowId, callback) {
  if (!windowId) {
    return
  }
  chrome.windows.get(windowId, function(browserWindow) {
    if (!browserWindow) {
      return
    }
    chrome.tabs.query({windowId: windowId}, function(tabs) {
      if (!tabs) {
        return
      }
      browserWindow.tabs = tabs
      callback(browserWindow)
    })
  })
}

/* WINDOW EVENTS */

function onWindowRemoved(windowId) {
  var windowName = windowIdToName[windowId]
  if (windowName) {
    var savedWindow = savedWindows[windowName]
    markWindowAsClosed(savedWindow)
  }
  delete isWindowClosing[windowId]
}
chrome.windows.onRemoved.addListener(onWindowRemoved)
