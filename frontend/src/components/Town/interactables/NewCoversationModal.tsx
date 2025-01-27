import {
  Button,
  FormControl,
  FormLabel,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  useToast,
} from '@chakra-ui/react';
import React, { useCallback, useEffect, useState } from 'react';
import { useInteractable } from '../../../classes/TownController';
import { ConversationArea } from '../../../generated/client';
import useTownController from '../../../hooks/useTownController';

export default function NewConversationModal(): JSX.Element {
  const coveyTownController = useTownController();
  const newConversation = useInteractable('conversationArea');
  const [topic, setTopic] = useState<string>('');

  const isOpen = newConversation !== undefined;

  useEffect(() => {
    if (newConversation) {
      coveyTownController.pause();
      const gameScene = coveyTownController.ourPlayer.gameObjects?.sprite?.scene;
      if (gameScene) {
        gameScene.scene.pause();
      }
    } else {
      coveyTownController.unPause();
      const gameScene = coveyTownController.ourPlayer.gameObjects?.sprite?.scene;
      if (gameScene) {
        gameScene.scene.resume();
      }
    }
  }, [coveyTownController, newConversation]);

  const closeModal = useCallback(() => {
    if (newConversation) {
      coveyTownController.interactEnd(newConversation);
      const gameScene = coveyTownController.ourPlayer.gameObjects?.sprite?.scene;
      if (gameScene) {
        gameScene.scene.resume();
      }
    }
  }, [coveyTownController, newConversation]);

  const toast = useToast();

  const createConversation = useCallback(async () => {
    if (topic && newConversation) {
      const conversationToCreate: ConversationArea = {
        topic,
        id: newConversation.name,
        occupantsByID: [],
      };
      try {
        await coveyTownController.createConversationArea(conversationToCreate);
        toast({
          title: 'Conversation Created!',
          status: 'success',
        });
        setTopic('');
        coveyTownController.unPause();
        closeModal();
      } catch (err) {
        if (err instanceof Error) {
          toast({
            title: 'Unable to create conversation',
            description: err.toString(),
            status: 'error',
          });
        } else {
          console.trace(err);
          toast({
            title: 'Unexpected Error',
            status: 'error',
          });
        }
      }
    }
  }, [topic, setTopic, coveyTownController, newConversation, closeModal, toast]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        closeModal();
        coveyTownController.unPause();
        const gameScene = coveyTownController.ourPlayer.gameObjects?.sprite?.scene;
        if (gameScene) {
          gameScene.scene.resume();
        }
      }}>
      <ModalOverlay />
      {/* eslint-disable */}
      <ModalContent>
        <ModalHeader>
          Create a conversation in {newConversation ? newConversation.name : ''}
        </ModalHeader>
        <ModalCloseButton />
        <form
          onSubmit={ev => {
            ev.preventDefault();
            createConversation();
          }}>
          {/* eslint-disable-next-line */}
          <ModalBody pb={6}>
            <FormControl>
              <FormLabel htmlFor='topic'>Topic of Conversation</FormLabel>
              <Input
                id='topic'
                placeholder='Share the topic of your conversation'
                name='topic'
                value={topic}
                onChange={e => setTopic(e.target.value)}
                onKeyDown={e => {
                  e.stopPropagation();
                }}
              />
            </FormControl>
          </ModalBody>
          <ModalFooter>
            <Button colorScheme='blue' mr={3} onClick={createConversation}>
              Create
            </Button>
            <Button onClick={closeModal}>Cancel</Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
}
