/**
 * Initialises an 'add another' control to add additional forms to a FormSet,
 * based on its emptyForm() template.
 * @param {string} prefix the FormSet's unique prefix.
 * @param {HTMLFormElement} form the form containing the FormSet's fields.
 */
function addAnother(prefix, form) {
  var el = {
    totalForms: form.elements[prefix + '-TOTAL_FORMS']
  , emptyForm: document.getElementById(prefix + 'EmptyForm')
  , forms: document.getElementById(prefix + 'Forms')
  , control: document.getElementById(prefix + 'AddAnother')
  }

  var emptyFormTemplate = $(el.emptyForm).html()

  $(el.control).click(function() {
    var totalForms = parseInt(el.totalForms.value, 10)
    $(emptyFormTemplate.replace(/__prefix__/g, totalForms)).appendTo(el.forms)
    el.totalForms.value = ++totalForms
  })
}