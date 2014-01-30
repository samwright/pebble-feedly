#include <pebble.h>
#include "comms.h"

/*
Communication Dictionary:

in general:
  Data_Indices = [12, 20, 32] (i.e. indices of the ends of each data segment)
  Data_Stream = "Ars TechnicaPhoronixThe Guardian       "


*/


static void init(void) {
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

static void deinit(void) {
  window_destroy(window);
  comm_deinit();
}

int main(void) {
  init();

  APP_LOG(APP_LOG_LEVEL_DEBUG, "Done initializing, pushed window: %p", window);

  app_event_loop();
  deinit();
}

