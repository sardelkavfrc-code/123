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

router.beforeEach(async (to) => {
  if (window.vkmp?.waitForBackend) {
    await window.vkmp.waitForBackend().catch(() => {});
  }
  const auth = useAuthStore();
  if (!auth.checked) {
    await auth.refresh();
  }
  if (!to.meta.public && !auth.isAuthenticated) {
    return { name: "auth", query: { redirect: to.fullPath } };
  }
  if (to.name === "auth" && auth.isAuthenticated) {
    return { path: "/" };
  }
  return true;
});
