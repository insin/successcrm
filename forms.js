var forms = require('newforms')
  , object = require('isomorph/object')

var choices = require('./choices')
  , settings = require('./settings')

var DATE_INPUT_FORMATS = settings.dateInputFormats
  , TIME_INPUT_FORMATS = settings.timeInputFormats

var dateWidget = forms.DateInput({format: DATE_INPUT_FORMATS[0]})
  , timeWidget = forms.TimeInput({format: TIME_INPUT_FORMATS[0]})

/**
 * Mixin for programatically adding errors to a form instance.
 */
var AddErrors = {
  addError: function(field, message) {
    this._errors.set(field,
                     new this.errorConstructor([message]))
  }
, addFormError: function(message) {
    this._errors.set(forms.NON_FIELD_ERRORS,
                     new this.errorConstructor([message]))
  }
}

/**
 * Mixin for rendering a form as hidden fields.
 */
var RenderHidden = {
  asHidden: function() {
    return this.boundFields().map(function(field) {
      return field.asHidden()
    }).join('')
  }
}

exports.LoginForm = forms.Form.extend({
  username : forms.CharField()
, password : forms.CharField({widget: forms.PasswordInput})
, next     : forms.CharField({required: false, widget: forms.HiddenInput})

, __mixin__: AddErrors
})

exports.UserForm = forms.Form.extend({
  firstName : forms.CharField()
, lastName  : forms.CharField()
, username  : forms.CharField()
, email     : forms.EmailField()
, isAdmin   : forms.BooleanField({required: false})

, __mixin__: AddErrors
})

/**
 * Clean function which validates that at least one part of a person's name has
 * been given.
 */
function requirePersonName() {
  if (!this.cleanedData.firstName && !this.cleanedData.lastName) {
    throw forms.ValidationError('A first name or last name is required.')
  }
  return this.cleanedData
}

exports.PersonForm = forms.Form.extend({
  title        : forms.ChoiceField({required: false, choices: choices.TITLE_CHOICES})
, firstName    : forms.CharField({required: false, maxLength: 50})
, lastName     : forms.CharField({required: false, maxLength: 50})
, jobTitle     : forms.CharField({required: false, maxLength: 100})
, organisation : forms.CharField({required: false})

, clean: requirePersonName
})

exports.OrganisationForm = forms.Form.extend({
  name : forms.CharField({maxLength: 100})
})

exports.InlinePersonForm = forms.Form.extend({
  firstName    : forms.CharField({required: false, maxLength: 50})
, lastName     : forms.CharField({required: false, maxLength: 50})
, jobTitle     : forms.CharField({required: false, maxLength: 100})
, email        : forms.EmailField({required: false})
, mobilePhone  : forms.CharField({required: false})
, directPhone  : forms.CharField({required: false})

, clean: requirePersonName
})

exports.InlinePersonFormSet = forms.formsetFactory(exports.InlinePersonForm)

exports.PhoneNumberForm = forms.Form.extend({
  number : forms.CharField({maxLength: 30})
, type   : forms.ChoiceField({required: false, choices: choices.PHONE_NUMBER_TYPE_CHOICES})
})

exports.PhoneNumberFormSet = forms.formsetFactory(exports.PhoneNumberForm)

exports.EmailAddressForm = forms.Form.extend({
  email : forms.EmailField()
, type  : forms.ChoiceField({required: false, choices: choices.EMAIL_TYPE_CHOICES})
})

exports.EmailAddressFormSet = forms.formsetFactory(exports.EmailAddressForm)

exports.AddressForm = forms.Form.extend({
  address  : forms.CharField({required: false, widget: forms.Textarea({attrs: {rows: 3, placeholder: 'Address'}})})
, type     : forms.ChoiceField({required: false, choices: choices.ADDRESS_TYPE_CHOICES})
, city     : forms.CharField({required: false, maxLength: 100, widget: forms.TextInput({attrs: {placeholder: 'City/Town'}})})
, county   : forms.CharField({required: false, maxLength: 100, widget: forms.TextInput({attrs: {placeholder: 'County'}})})
, postCode : forms.CharField({required: false, maxLength: 8, widget: forms.TextInput({attrs: {placeholder: 'Postcode'}})})
, country  : forms.ChoiceField({required: false, choices: choices.COUNTRY_CHOICES})
})

exports.AddressFormSet = forms.formsetFactory(exports.AddressForm)

exports.CategoryForm = forms.Form.extend({
  name: forms.CharField()

, __mixin__: AddErrors
})

exports.TaskForm = forms.Form.extend({
  description : forms.CharField({maxLength: 140})
, detail      : forms.CharField({required: false, widget: forms.Textarea})
, due         : forms.DateField({inputFormats: DATE_INPUT_FORMATS, widget: dateWidget})
, time        : forms.TimeField({required: false, inputFormats: TIME_INPUT_FORMATS, widget: timeWidget})
, category    : forms.ChoiceField({required: false})
, assignedTo  : forms.ChoiceField()
, contact     : forms.CharField({required: false})

, __mixin__: AddErrors
, constructor: function(kwargs) {
    kwargs = object.extend({categories: [], users: []}, kwargs)
    forms.Form.call(this, kwargs)
    this.fields.category.setChoices(kwargs.categories)
    this.fields.assignedTo.setChoices(kwargs.users)
  }
})

exports.TaskContextForm = forms.Form.extend({
  next    : forms.CharField({required: false})
, contact : forms.IntegerField({required: false, minValue: 1})

, __mixin__: RenderHidden
, constructor: function(kwargs) {
    kwargs.prefix = 'context'
    kwargs.autoId = false
    forms.Form.call(this, kwargs)
  }
})

exports.TaskFilterForm = forms.Form.extend({
  assignedTo  : forms.ChoiceField({required: false})
, category    : forms.ChoiceField({required: false})

, constructor: function(kwargs) {
    kwargs = object.extend({categories: [], users: []}, kwargs)
    forms.Form.call(this, kwargs)
    this.fields.assignedTo.setChoices(kwargs.users)
    this.fields.category.setChoices(kwargs.categories)
  }
})
