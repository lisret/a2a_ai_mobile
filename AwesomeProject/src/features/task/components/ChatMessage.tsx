/**
 * 聊天消息组件
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AppIcon, IconNames } from '@shared/components/Icon';
import { formatTime } from '@shared/utils/formatters';

interface ChatMessageProps {
  content: string;
  timestamp: number;
  isUser?: boolean;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({
  content,
  timestamp,
  isUser = false,
}) => {
  return (
    <View style={[styles.message, isUser ? styles.messageUser : styles.messageAI]}>
      {!isUser && (
        <View style={[styles.avatar, styles.aiAvatar]}>
          <AppIcon name={IconNames.robot} size={18} color="#2563eb" />
        </View>
      )}
      <View style={[styles.messageContent, isUser ? styles.userMessageContent : styles.aiMessageContent]}>
        <Text style={isUser ? styles.userMessageText : styles.aiMessageText}>{content}</Text>
        <Text style={styles.messageTime}>{formatTime(timestamp)}</Text>
      </View>
      {isUser && (
        <View style={[styles.avatar, styles.userAvatar]}>
          <AppIcon name={IconNames.user} size={18} color="#fff" />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  message: {
    flexDirection: 'row',
    marginBottom: 16,
    alignItems: 'flex-end',
  },
  messageUser: {
    justifyContent: 'flex-end',
  },
  messageAI: {
    justifyContent: 'flex-start',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userAvatar: {
    backgroundColor: '#165DFF',
    marginLeft: 8,
  },
  aiAvatar: {
    backgroundColor: '#e5e5e5',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  messageContent: {
    maxWidth: '80%',
    padding: 12,
    paddingHorizontal: 16,
    borderRadius: 18,
  },
  userMessageContent: {
    backgroundColor: '#165DFF',
    borderBottomRightRadius: 4,
  },
  aiMessageContent: {
    backgroundColor: '#fff',
    borderBottomRightRadius: 18,
    borderBottomLeftRadius: 4,
  },
  userMessageText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#fff',
  },
  aiMessageText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#1d1d1f',
  },
  messageTime: {
    fontSize: 11,
    color: '#86868b',
    marginTop: 4,
  },
});

