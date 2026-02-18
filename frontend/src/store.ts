import { configureStore } from "@reduxjs/toolkit";
import authReducer from "./lib/store/slices/authSlice";
import pipelineReducer from "./lib/store/slices/pipelineSlice";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    pipeline: pipelineReducer,   // ← THIS WAS MISSING
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
