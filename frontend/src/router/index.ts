import { createRouter, createWebHashHistory, type RouteRecordRaw } from "vue-router";
import { useAuthStore } from "@/stores/auth";

const routes: RouteRecordRaw[] = [
  {
    path: "/auth",
    name: "auth",
    component: () => import("@/views/AuthView.vue"),
    meta: { public: true, layout: "blank" },
  },
  {
    path: "/",
    name: "home",
    component: () => import("@/views/HomeView.vue"),
  },
  {
    path: "/library",
    name: "library",
    component: () => import("@/views/MyMusicView.vue"),
  },
  {
    path: "/library/dislikes",
    name: "dislikes",
    component: () => import("@/views/DislikesView.vue"),
  },
  {
    path: "/friends",
    name: "friends",
    component: () => import("@/views/FriendsView.vue"),
  },
  {
    path: "/friends/:id",
    name: "friend-music",
    component: () => import("@/views/FriendMusicView.vue"),
    props: true,
  },
  {
    path: "/search",
    name: "search",
    component: () => import("@/views/SearchView.vue"),
  },
  {
    path: "/queue",
    name: "queue",
    component: () => import("@/views/QueueView.vue"),
  },
  {
    path: "/artist/:id",
    name: "artist",
    component: () => import("@/views/ArtistView.vue"),
    props: true,
  },
  {
    path: "/similar/:audioId",
    name: "similar",
    component: () => import("@/views/SimilarView.vue"),
    props: true,
  },
  {
    path: "/settings",
    name: "settings",
    component: () => import("@/views/SettingsView.vue"),
  },
  {
    path: "/device",
    name: "device",
    component: () => import("@/views/DeviceView.vue"),
  },
  { path: "/:pathMatch(.*)*", redirect: "/" },
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior(_to, _from, savedPosition) {
    if (savedPosition) {
      return savedPosition;
    } else {
      return { top: 0 };
    }
  },
});

let isFirstNavigation = true;

router.beforeEach(async (to) => {
  if (window.vkmp?.waitForBackend) {
    await window.vkmp.waitForBackend().catch(() => {});
  }
  const auth = useAuthStore();

  if (isFirstNavigation) {
    isFirstNavigation = false;
    const updateState = localStorage.getItem("vkmp:update_restore_state");
    if (!updateState && (to.name === "home" || to.path === "/")) {
      const savedTab = localStorage.getItem("vkmp:active_tab");
      if (savedTab === "device") {
        return { name: "device" };
      }
      return { name: "library" };
    }
  }

  // Defer authentication refresh until VK routes are accessed
  const vkRoutes = ["home", "library", "friends", "search", "friend-music", "artist", "similar"];
  if (vkRoutes.includes(to.name as string)) {
    if (!auth.vkApiAllowed) {
      auth.vkApiAllowed = true;
      // We do not await here if authenticated from cache, we let it happen below or in background
    }
  }

  if (to.name !== "device" && !auth.checked) {
    if (!auth.isAuthenticated) {
      await auth.refresh();
    } else {
      // Authenticated from cache, refresh in background to avoid blocking UI
      // But now we want the UI to wait for this check for the startup animation
      await auth.refresh();
    }
  } else if (to.name === "device" && !auth.checked) {
    auth.checked = true;
  }
  
  if (to.name !== "device" && !to.meta.public && !auth.isAuthenticated) {
    return { name: "auth", query: { redirect: to.fullPath } };
  }
  if (to.name === "auth" && auth.isAuthenticated) {
    return { path: "/" };
  }
  return true;
});

router.afterEach((to) => {
  if (to.name && typeof to.name === "string" && to.name !== "auth") {
    const spawnTab = to.name === "device" ? "device" : "library";
    localStorage.setItem("vkmp:active_tab", spawnTab);
  }
});
