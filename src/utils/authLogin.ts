// 인증 관련 유틸리티 함수들

// 사용자 데이터 타입 정의
export interface UserData {
  id: number;
  email: string;
  name?: string;
}

// 로그인 응답 타입 정의
export interface LoginResponse {
  token: string;
  user: UserData;
}

// 로그인 요청 타입 정의
export interface LoginRequest {
  email: string;
  password: string;
}

// 회원가입 요청 타입 정의
export interface RegisterRequest {
  email: string;
  password: string;
  name?: string;
}

// JWT 토큰 확인
export const getToken = (): string | null => {
  return localStorage.getItem("token");
};

// 토큰 저장
export const saveToken = (token: string): void => {
  localStorage.setItem("token", token);
};

// 토큰 제거
export const removeToken = (): void => {
  localStorage.removeItem("token");
};

// 로그인 상태 확인 (토큰과 사용자 정보 둘 다 확인)
export const isAuthenticated = (): boolean => {
  const token = getToken();
  const user = getCurrentUser();
  return token !== null && user !== null;
};

// 현재 사용자 정보 가져오기
export const getCurrentUser = (): UserData | null => {
  const user = localStorage.getItem("user");
  if (!user) return null;

  try {
    return JSON.parse(user) as UserData;
  } catch (error) {
    console.error("사용자 정보 파싱 오류:", error);
    return null;
  }
};

// 로그아웃
export const logout = (): void => {
  removeToken();
  localStorage.removeItem("user");
  // 페이지 새로고침하여 로그인 페이지로 리디렉션
  window.location.href = "/login";
};

// 사용자 정보 저장
export const saveUser = (userData: UserData): void => {
  localStorage.setItem("user", JSON.stringify(userData));
};

// 로그인 완료 후 토큰과 사용자 정보 모두 저장
export const saveAuthData = (loginResponse: LoginResponse): void => {
  saveToken(loginResponse.token);
  saveUser(loginResponse.user);
};

// 로그인 API 호출
export const loginUser = async (
  loginData: LoginRequest
): Promise<LoginResponse> => {
  const response = await fetch("https://drawing-web-gyrt.onrender.com/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(loginData),
  });

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ message: "로그인 실패" }));
    throw new Error(errorData.message || "로그인에 실패했습니다.");
  }

  const result: LoginResponse = await response.json();

  // 로그인 성공 시 토큰과 사용자 정보 저장
  saveAuthData(result);

  return result;
};

// 회원가입 API 호출
export const registerUser = async (
  registerData: RegisterRequest
): Promise<LoginResponse> => {
  const response = await fetch("https://drawing-web-gyrt.onrender.com/api/auth/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(registerData),
  });

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ message: "회원가입 실패" }));
    throw new Error(errorData.message || "회원가입에 실패했습니다.");
  }

  const result: LoginResponse = await response.json();

  // 회원가입 성공 시 토큰과 사용자 정보 저장
  saveAuthData(result);

  return result;
};

// 토큰 유효성 검사
export const validateToken = (): boolean => {
  const token = getToken();
  if (!token) return false;

  try {
    // JWT 토큰의 payload 부분 디코딩 (만료 시간 확인)
    const payload = JSON.parse(atob(token.split(".")[1]));
    const currentTime = Date.now() / 1000;

    if (payload.exp && payload.exp < currentTime) {
      // 토큰이 만료된 경우 제거
      logout();
      return false;
    }

    return true;
  } catch {
    // 토큰 형식이 잘못된 경우 제거
    logout();
    return false;
  }
};
