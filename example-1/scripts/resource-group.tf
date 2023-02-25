resource "azurerm_resource_group" "flixtube" {
  name     = var.app_name_rg
  location = var.location
}
