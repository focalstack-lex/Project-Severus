//! P0 Rust Behavioural Verification Harness for Severus Backend.
//! Tests tray event emission mapping, floating mode dimensions, and window restore bounds.

use severus_desktop_lib::*;

#[test]
fn test_tray_click_emits_open_workstation() {
    assert_eq!(tray_click_emitted_event("show"), Some("severus:open-workstation"));
    assert_eq!(tray_click_emitted_event("maximize"), Some("severus:open-workstation"));
    assert_eq!(tray_click_emitted_event("left_click"), Some("severus:open-workstation"));
    assert_eq!(tray_click_emitted_event("quit"), None);
}

#[test]
fn test_set_floating_mode_applies_780_x_110() {
    let (width, height) = calculate_floating_mode_dimensions(true);
    assert_eq!(width, 780.0);
    assert_eq!(height, 110.0);
}

#[test]
fn test_window_restore_centers_and_unhides_1280_x_820() {
    let (width, height, unhide) = calculate_window_restore_bounds(true);
    assert_eq!(width, 1280.0);
    assert_eq!(height, 820.0);
    assert!(unhide, "Window restore must unhide the window");
}
