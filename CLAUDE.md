# Shopping

## Overview

Shopping is a self contained app that runs on an iphone.
The user can maintain a list of items
The user can maintain a list of menus which contain items
The user can create a shopping list based on selected menus. 
The shopping list contains all the items from the selected menus. 
Items on the shopping list can be added, removed or marked as completed

# Data

Data is self contained on the device

## Tables

item: name, location
menu: name, list of items
list: name, list of items

# Functions

## items
Maintain (Create, update, delete) items

## menus
Maintain (Create, update, delete) menus

## lists
Generate list - select menus and include all items on those menus

## shop
display list of items in location order. 
each item can be removed from the list
each item can be marked as completed with a checkbox
when item is checked it is struck through, when unchecked it is normal