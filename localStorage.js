// helper function to restore from localStorage
function restoreFromLocalStorage(key, defaultValue) {
  var value = localStorage.getItem(key)
  if (value) {
    return JSON.parse(value)
  } else {
    localStorage.setItem(key, JSON.stringify(defaultValue))
    return defaultValue
  }
}
