/* global chrome */

// FEATURE: support drag & drop re-ordering
// FEATURE: support drag & drop merging

var backgroundPage = chrome.extension.getBackgroundPage()
var savedWindowListEl, formEl, nameInput, template
var undo = {}

function init() {
  // initialize variables we'll need
  savedWindowListEl = document.getElementById('savedWindowList')
  formEl = document.getElementById('form')
  nameInput = document.getElementById('nameInput')
  template = document.getElementById('template')

  // initialize links
  formEl.addEventListener('submit', saveWindow, false)

  // CSS buster - only used when developing locally
  // style = document.getElementById("style");
  // style.href = style.href + "?salt=" + Math.random();

  // populate list of windows
  chrome.windows.getCurrent(function(currentWindow) {
    var currentWindowName = backgroundPage.windowIdToName[currentWindow.id]
    var savedWindows = backgroundPage.savedWindows
    var savedWindowNames = backgroundPage.savedWindowNames
    for (var i in savedWindowNames) {
      var name = savedWindowNames[i]
      var savedWindow = savedWindows[name]
      appendWindowToList(savedWindow, currentWindowName)
    }
    if (!currentWindowName) {
      if (currentWindow.incognito) {
        document.getElementById('incognitoMsg').style.display = 'block'
      } else {
        nameInput.value = backgroundPage.DEFAULT_NAME
        formEl.style.display = 'block'
        nameInput.focus()
        nameInput.select()
      }
    }
  })

  // decrement update message counter
  var count = backgroundPage.updateMsgCount
  if (count > 0) {
    backgroundPage.updateMsgCount = count - 1
    localStorage.updateMsgCount = count - 1
    document.getElementById('update').style.display = 'block'
  } else {
    backgroundPage.updateBadgeForAllWindows()
  }
}
document.addEventListener('DOMContentLoaded', init)

// add window to HTML list of windows
function appendWindowToList(savedWindow, currentWindowName) {
  var li = template.cloneNode(true)
  li.removeAttribute('id')
  li.setAttribute('data-name', savedWindow.name)
  li.querySelector('.delete').addEventListener(
    'click',
    deleteSavedWindow,
    false
  )
  li.querySelector('.undo').addEventListener(
    'click',
    undoDeleteSavedWindow,
    false
  )

  var count = savedWindow.tabs.length
  var text = savedWindow.displayName + ' (' + count + ')'
  if (savedWindow.name === currentWindowName) {
    li.className = 'current'
    text = 'This is <b>' + text + '</b>.'
  } else if (savedWindow.id) {
    li.className = 'open'
    li.addEventListener('click', focusOpenWindow, false)
  } else {
    li.addEventListener('click', openSavedWindow, false)
  }
  setText(li, text)

  // FEATURE: add "add to this set" to add current tabs to existing one

  savedWindowListEl.insertBefore(li, savedWindowListEl.firstChild)
}

// save window in background page and update display
function saveWindow(event) {
  event.preventDefault()
  chrome.windows.getCurrent(function(currentWindow) {
    chrome.tabs.query({currentWindow: true}, function(tabs) {
      currentWindow.tabs = tabs
      let savedWindow = backgroundPage.saveWindow(
        currentWindow,
        nameInput.value
      )
      formEl.style.display = 'none'
      appendWindowToList(savedWindow, nameInput.value)
    })
  })
}

// open a saved window
// called when the user clicks the name of a saved window that is closed.
function openSavedWindow(event) {
  event.preventDefault()

  var name = event.currentTarget.getAttribute('data-name')
  backgroundPage.openWindow(name)

  var savedWindow = backgroundPage.savedWindows[name]
}

// focus an open window
// called when the user clicks the name of a saved window that is open.
function focusOpenWindow(event) {
  event.preventDefault()

  var name = event.currentTarget.getAttribute('data-name')
  var savedWindow = backgroundPage.savedWindows[name]

  chrome.windows.update(savedWindow.id, {focused: true})
}

// delete a saved window
// called when the user presses the delete button
function deleteSavedWindow(event) {
  event.preventDefault()
  event.stopPropagation()

  // get data
  var li = event.target.parentNode
  var name = li.getAttribute('data-name')
  var savedWindow = backgroundPage.savedWindows[name]
  var text = li.childNodes[1].innerHTML

  // save information for undo
  undo[name] = {
    className: li.className,
    text: text,
    savedWindow: savedWindow,
    id: savedWindow.id
  }
  // we save this separately since deleteSavedWindow nixes it.
  if (savedWindow.id) {
    undo[name].id = savedWindow.id
  }

  // actually perform the deletion
  backgroundPage.deleteSavedWindow(name)

  // update display
  li.className = 'deleted'
  setText(li, '<b>' + getDisplayName(savedWindow) + '</b> was deleted.')
  // TODO: show the form if current window
}

// undo a deletion
// called when the user presse the undo button
function undoDeleteSavedWindow(event) {
  event.preventDefault()
  event.stopPropagation()

  // get data
  var li = event.target.parentNode
  var name = li.getAttribute('data-name')
  var undoInfo = undo[name]
  var savedWindow = undoInfo.savedWindow

  // restore the window id
  if (undoInfo.id) {
    savedWindow.id = undoInfo.id
  }

  // resave the window
  backgroundPage.saveWindow(savedWindow, name)

  // update display
  li.className = undoInfo.className
  setText(li, undoInfo.text)

  // clean up
  delete undo[name]
  // TODO: hide the form if current window
}

// given a list element, sets the text
function setText(element, text) {
  element.childNodes[1].innerHTML = text
}

// formats the name for display
function getDisplayName(savedWindow) {
  return savedWindow.displayName + ' (' + savedWindow.tabs.length + ')'
}