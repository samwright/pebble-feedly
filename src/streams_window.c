#include <pebble.h>
#include "comms.h"

static Window *streams_window;
static SimpleMenuLayer *streams_layer;

static void select_long_click_handler(ClickRecognizerRef recognizer, void *context) {
//   Window *window = (Window *)context;
  APP_LOG(APP_LOG_LEVEL_DEBUG, "Started long-click");
}

static void select_long_click_release_handler(ClickRecognizerRef recognizer, void *context) {
  APP_LOG(APP_LOG_LEVEL_DEBUG, "Ended long-click");
//   Window *window = (Window *)context;

  // Send to phone  
  DictionaryIterator *iter;
  Tuplet code = TupletInteger(0, 0);
//   Tuplet scope = TupletInteger(KEY_SCOPE, SCOPE_LISTS);

  app_message_outbox_begin(&iter);
  dict_write_tuplet(iter, &code);
  app_message_outbox_send();
}

static void select_click_handler(ClickRecognizerRef recognizer, void *context) { 
  snprintf(output, 14, "inbox: %lu", (unsigned long)app_message_inbox_size_maximum());
//   snprintf(output, 14, "No Message");  
  text_layer_set_text(text_layer, output);
  
}

static void up_click_handler(ClickRecognizerRef recognizer, void *context) {
  text_layer_set_text(text_layer, "Up");
}

static void down_click_handler(ClickRecognizerRef recognizer, void *context) {
  text_layer_set_text(text_layer, "Down");
}

static void click_config_provider(void *context) {
  window_single_click_subscribe(BUTTON_ID_SELECT, select_click_handler);
  window_single_click_subscribe(BUTTON_ID_UP, up_click_handler);
  window_single_click_subscribe(BUTTON_ID_DOWN, down_click_handler);
  window_long_click_subscribe(BUTTON_ID_SELECT, 700, select_long_click_handler, select_long_click_release_handler);
}

static void window_load(Window *window) {
  Layer *window_layer = window_get_root_layer(window);
  GRect bounds = layer_get_bounds(window_layer);

  text_layer = text_layer_create((GRect) { .origin = { 0, 72 }, .size = { bounds.size.w, 20 } });
  text_layer_set_text(text_layer, "Press a button");
  text_layer_set_text_alignment(text_layer, GTextAlignmentCenter);

  layer_add_child(window_layer, text_layer_get_layer(text_layer));
}

void streams_window_unload(Window *window) {
  text_layer_destroy(text_layer);
}

void streams_window_init(void) {
  window = window_create();
  window_set_click_config_provider(window, click_config_provider);
  window_set_window_handlers(window, (WindowHandlers) {
    .load = window_load,
    .unload = window_unload,
  });
  
  comm_init();
  
  const bool animated = true;
  window_stack_push(window, animated);
}

void streams_window_deinit(void) {
  window_destroy(window);
  comm_deinit();
}
