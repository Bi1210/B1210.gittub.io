
import React, { useLayoutEffect, useState } from 'react';

interface ModalProps {
    isOpen: boolean;
    title: string;
    onClose: () => void;
    children: React.ReactNode;
    footer?: React.ReactNode;
}

// 玻璃弹窗不能在带 backdrop-filter 的卡片本身上做 transform 动画：
// iOS WebKit 会先渲染一帧灰色离屏纹理，约半秒后才恢复正确折射。
// 因此这里用 opacity 做通用进退场，并在关闭时延迟卸载，让所有共享 Modal
// 都有完整的退场阶段；Echoes 不使用这个组件，视觉完全不受影响。
const MODAL_EXIT_MS = 180;

const Modal: React.FC<ModalProps> = ({ isOpen, title, onClose, children, footer }) => {
    const [mounted, setMounted] = useState(isOpen);
    // 打开时首帧直接可见：不再经过 requestAnimationFrame 的透明/灰色中间帧。
    const [present, setPresent] = useState(isOpen);

    useLayoutEffect(() => {
        let timer: number | undefined;

        if (isOpen) {
            setMounted(true);
            setPresent(true);
        } else if (mounted) {
            setPresent(false);
            timer = window.setTimeout(() => setMounted(false), MODAL_EXIT_MS);
        }

        return () => {
            if (timer !== undefined) window.clearTimeout(timer);
        };
    }, [isOpen, mounted]);

    if (!mounted) return null;

    return (
        <div className={`fixed inset-0 z-[100] flex items-center justify-center p-6 sully-modal-overlay ${present ? 'sully-modal-overlay-open' : 'sully-modal-overlay-closing'}`}>
            <div className="absolute inset-0 sully-modal-scrim" onClick={onClose} />
            <div className="sully-global-modal-card sully-modal-card sully-popup-card relative w-full max-w-sm rounded-[2.5rem] shadow-2xl border overflow-hidden">
                <div className="px-6 pt-6 pb-2">
                    <h3 className="text-lg font-bold text-slate-800 text-center">{title}</h3>
                </div>
                <div className="px-6 py-4 max-h-[60vh] overflow-y-auto no-scrollbar">
                    {children}
                </div>
                {footer ? (
                    <div className="px-6 pb-6 flex gap-3">
                        {footer}
                    </div>
                ) : (
                    <div className="px-6 pb-6">
                        <button
                            onClick={onClose}
                            className="w-full py-3 bg-slate-100 text-slate-500 font-bold rounded-2xl active:scale-95 transition-transform"
                        >
                            关闭
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Modal;
