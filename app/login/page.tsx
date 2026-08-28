import type { Metadata } from 'next';
import { LoginScreen } from '../components/auth/LoginScreen';

export const metadata: Metadata = {
  title: 'Đăng nhập — YooLab',
  description: 'Đăng nhập vào YooLab để soạn giảng và thực hành thí nghiệm 3D/VR/XR.',
};

export default function LoginPage() {
  return <LoginScreen />;
}
