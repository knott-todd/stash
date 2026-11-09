// Signed in, the app is four peers in thumb reach: My drive, Photos, Devices, Settings
// (docs/phone/02-my-drive.md). Each tab keeps its own stack, so a folder deep in My drive
// stays put while you glance at Photos; tapping the active tab returns to its root.

import React from "react";
import { StyleSheet } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Folder, Image as ImageIcon, MonitorSmartphone, Settings as SettingsIcon } from "lucide-react-native";
import { font, ink, ink3, line, paper } from "../ui";
import { DriveScreen } from "./Drive";
import { MovePickerScreen } from "./MovePicker";
import { PhotosScreen } from "./Photos";
import { DevicesScreen, LinkDeviceScreen } from "./Devices";
import { ProtectionScreen, SettingsScreen } from "./Settings";

const Tabs = createBottomTabNavigator();
const DriveStack = createNativeStackNavigator();
const PhotosStack = createNativeStackNavigator();
const DevicesStack = createNativeStackNavigator();
const SettingsStack = createNativeStackNavigator();

const stackOptions = { headerShown: false, animation: "slide_from_right" as const, contentStyle: { backgroundColor: paper } };

function DriveTab() {
  return (
    <DriveStack.Navigator screenOptions={stackOptions}>
      <DriveStack.Screen name="Drive" component={DriveScreen} />
      <DriveStack.Screen name="DriveMove" component={MovePickerScreen} options={{ animation: "slide_from_bottom" }} />
    </DriveStack.Navigator>
  );
}
function PhotosTab() {
  return (
    <PhotosStack.Navigator screenOptions={stackOptions}>
      <PhotosStack.Screen name="Photos" component={PhotosScreen} />
    </PhotosStack.Navigator>
  );
}
function DevicesTab() {
  return (
    <DevicesStack.Navigator screenOptions={stackOptions}>
      <DevicesStack.Screen name="Devices" component={DevicesScreen} />
      <DevicesStack.Screen name="LinkDevice" component={LinkDeviceScreen} />
    </DevicesStack.Navigator>
  );
}
function SettingsTab() {
  return (
    <SettingsStack.Navigator screenOptions={stackOptions}>
      <SettingsStack.Screen name="Settings" component={SettingsScreen} />
      <SettingsStack.Screen name="Protection" component={ProtectionScreen} />
    </SettingsStack.Navigator>
  );
}

export function HomeTabs() {
  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: ink,
        tabBarInactiveTintColor: ink3,
        tabBarStyle: s.bar,
        tabBarLabelStyle: s.label,
        tabBarItemStyle: s.item,
        sceneStyle: { backgroundColor: paper },
        animation: "fade",
      }}
    >
      <Tabs.Screen name="DriveTab" component={DriveTab} options={{ title: "My drive", tabBarIcon: ({ color }) => <Folder color={color} size={23} strokeWidth={1.8} /> }} />
      <Tabs.Screen name="PhotosTab" component={PhotosTab} options={{ title: "Photos", tabBarIcon: ({ color }) => <ImageIcon color={color} size={23} strokeWidth={1.8} /> }} />
      <Tabs.Screen name="DevicesTab" component={DevicesTab} options={{ title: "Devices", tabBarIcon: ({ color }) => <MonitorSmartphone color={color} size={23} strokeWidth={1.8} /> }} />
      <Tabs.Screen name="SettingsTab" component={SettingsTab} options={{ title: "Settings", tabBarIcon: ({ color }) => <SettingsIcon color={color} size={23} strokeWidth={1.8} /> }} />
    </Tabs.Navigator>
  );
}

const s = StyleSheet.create({
  bar: { backgroundColor: paper, borderTopColor: line, borderTopWidth: StyleSheet.hairlineWidth, height: 64, paddingTop: 6, elevation: 0 },
  label: { fontFamily: font.medium, fontSize: 12, marginTop: 2 },
  item: { paddingVertical: 4 },
});
